import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";
import { base64ToUint8Array, float32To16BitPCM, arrayBufferToBase64, pcm16ToAudioBuffer } from "./audioUtils";
import { performSearch, generateImage, reimagineImage } from "./toolService";
import { ConnectionState, MessageLog } from "../types";

// Tool Declarations
const searchTool: FunctionDeclaration = {
  name: "search_google",
  description: "Search Google for up-to-date information, news, or facts.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The search query." },
    },
    required: ["query"],
  },
};

const createTool: FunctionDeclaration = {
  name: "create_illustration",
  description: "Create an illustration or image based on a description. Use this tool whenever the user asks to generate, create, or draw an image from scratch.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING, description: "Detailed description of the image to create." },
    },
    required: ["prompt"],
  },
};

const reimagineTool: FunctionDeclaration = {
  name: "reimagine_user",
  description: "Captures the current view from the user's camera to create a new AI-generated image based on it. Use this tool triggers for: 'take a photo of me', 'take a picture', 'capture me', 'selfie', 'make me look like...', 'turn me into...', or 'reimagine this scene'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING, description: "The visual description for the new image. If the user simply asks to 'take a photo' without specifying a style, use 'A high quality professional portrait of the person'." },
    },
    required: ["prompt"],
  },
};
const playMusicTool: FunctionDeclaration = {
  name: "play_music",
  description: "Opens Spotify to search for and play a song, artist, or playlist the user wants to listen to.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The song, artist, or playlist name to search for." },
    },
    required: ["query"],
  },
};
const openYoutubeTool: FunctionDeclaration = {
  name: "open_youtube",
  description: "Opens YouTube (app or web) to search for a video, channel, or topic.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The video, channel, or topic to search for on YouTube." },
    },
    required: ["query"],
  },
};

const openWebsiteTool: FunctionDeclaration = {
  name: "open_website",
  description: "Opens a website or performs a general web search in the browser, for requests like 'open google.com' or 'search for X and show me the results'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "A URL to open directly, or a search term if no specific site was named." },
    },
    required: ["query"],
  },
};
const identifySongTool: FunctionDeclaration = {
  name: "identify_song",
  description: "Listens to the ambient sound for a few seconds to identify what song is currently playing, like Shazam. Use this when the user asks 'what song is this' or similar.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};
const rememberFactTool: FunctionDeclaration = {
  name: "remember_fact",
  description: "Saves a piece of information the user wants Jarvis to remember for future conversations, like their name, preferences, or important details.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      fact: { type: Type.STRING, description: "The fact to remember, phrased clearly, e.g. 'The user's name is Carlos' or 'The user's favorite color is blue'." },
    },
    required: ["fact"],
  },
};
export class LiveService {
  private ai: GoogleGenAI;
  private session: any = null; // Typing 'any' because session type is internal to SDK implementation for now
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextStartTime: number = 0;
  private currentCameraFrame: string | null = null;
  private micStream: MediaStream | null = null;

  public onStateChange: (state: ConnectionState) => void = () => {};
  public onMessage: (msg: MessageLog) => void = () => {};
  public onVolume: (vol: number) => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  public updateCameraFrame(base64: string) {
    this.currentCameraFrame = base64;
    // Push frame to model to give it vision
    if (this.session) {
       // Remove the Data URI prefix (e.g., "data:image/jpeg;base64,") to get raw base64 bytes
       const imageBase64 = base64.replace(/^data:image\/[a-z]+;base64,/, "");
       this.session.sendRealtimeInput({
          media: {
             mimeType: 'image/jpeg',
             data: imageBase64
          }
       });
      }
   }
  private getMemoryContext(): string {
  try {
    const facts = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
    if (facts.length === 0) return '';
    return ' Known facts about the user: ' + facts.join('; ') + '.';
  } catch {
    return '';
  }
}

private saveMemoryFact(fact: string) {
  try {
    const facts = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
    facts.push(fact);
    localStorage.setItem('jarvis_memory', JSON.stringify(facts));
  } catch (e) {
    console.error('Failed to save memory', e);
  }
}
      private recordAmbientAudio(durationMs: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.micStream) {
        reject(new Error("Microphone not available"));
        return;
      }
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(this.micStream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => { resolve(new Blob(chunks, { type: 'audio/webm' })); };
      recorder.onerror = (e: any) => reject(e.error || new Error("Recording failed"));
      recorder.start();
      setTimeout(() => { recorder.stop(); }, durationMs);
    });
      }

  public async connect() {
    this.onStateChange(ConnectionState.CONNECTING);

    try {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      
      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            this.onStateChange(ConnectionState.CONNECTED);
            this.setupAudioInput(stream, sessionPromise);
          },
          onmessage: (msg) => this.handleMessage(msg, sessionPromise),
          onclose: () => this.onStateChange(ConnectionState.DISCONNECTED),
          onerror: (err) => {
            console.error(err);
            this.onStateChange(ConnectionState.ERROR);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "You are Jarvis, a highly advanced AI assistant. You are helpful, precise, and have a futuristic personality. When the user asks to play, listen to, or hear music, a song, or an artist, you MUST use the play_music tool instead of search_google. When the user asks to watch, see, or find a video on YouTube, use the open_youtube tool. When the user asks to open a specific website, or wants to see search results in the browser (not just hear the answer), use the open_website tool. Use search_google only when the user wants a spoken answer, not to open a page. When the user asks what song is playing or to identify a song by listening, use the identify_song tool. It takes a few seconds while it listens. \n\nCRITICAL RULES:\n1. If the user asks to 'create', 'generate', or 'draw' an image from scratch, you MUST use the `create_illustration` tool.\n2. If the user asks to 'take a photo', 'capture me', 'selfie', 'picture of me', or 'reimagine' them, you MUST use the `reimagine_user` tool. Do NOT just describe the video feed textually. You must generate an actual image using the tool.\n3. For real-time information/facts, use `search_google`.\n4. Always confirm verbally when you are about to perform an action (e.g., 'Capturing that for you now...When the user asks to play music, listen to a song, or hear an artist, you MUST use the play_music tool — do NOT use search_google for music requests.') If the user asks 'what song is this', to identify a song playing nearby, or to Shazam a song, you MUST use the identify_song tool — this listens to ambient audio. Do NOT use search_google for this, even if the user describes lyrics or hums.When the user tells you something to remember (like their name or a preference), use the remember_fact tool to save it." + this.getMemoryContext(),
          tools: [{ functionDeclarations: [searchTool, createTool, reimagineTool, playMusicTool, openYoutubeTool, openWebsiteTool, identifySongTool, rememberFactTool] }]
        }
      });
      
      this.session = await sessionPromise;

    } catch (error) {
      console.error("Connection failed", error);
      this.onStateChange(ConnectionState.ERROR);
    }
  }

  public async disconnect() {
    if (this.session) {
      // session.close() might not be exposed directly on the resolved promise object in all SDK versions, 
      // but assuming standard close if available or just stopping streams.
      // The SDK example uses callbacks.onclose. 
      // We will force cleanup here.
    }
    
    if (this.inputSource) this.inputSource.disconnect();
    if (this.processor) {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
    }
    if (this.inputAudioContext) await this.inputAudioContext.close();
    if (this.outputAudioContext) await this.outputAudioContext.close();
    
    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.session = null;
    this.onStateChange(ConnectionState.DISCONNECTED);
  }

  private setupAudioInput(stream: MediaStream, sessionPromise: Promise<any>) {
    if (!this.inputAudioContext) return;
    
    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    
    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.onVolume(rms);

      const pcm16 = float32To16BitPCM(inputData);
      const base64 = arrayBufferToBase64(pcm16);
      
      sessionPromise.then(session => {
        session.sendRealtimeInput({
          media: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64
          }
        });
      });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage, sessionPromise: Promise<any>) {
    // 1. Handle Tool Calls FIRST to prevent timeouts
    // Tool calls must be acknowledged immediately.
    const toolCall = message.toolCall;
    if (toolCall) {
      for (const fc of toolCall.functionCalls) {
        let result: any = { result: "ok" };
        
        try {
          if (fc.name === "search_google") {
             const args = fc.args as any;
             this.onMessage({
               id: fc.id,
               role: 'model',
               text: `Searching for: ${args.query}...`,
               timestamp: new Date()
             });
             
             const searchResult = await performSearch(args.query);
             result = { result: searchResult.text }; // Send text back to model
             
             // Update UI with rich content
             this.onMessage({
                id: fc.id + '_res',
                role: 'system',
                text: "Search Complete",
                timestamp: new Date(),
                metadata: {
                    type: 'search',
                    sources: searchResult.sources
                }
             });

          } else if (fc.name === "create_illustration") {
             const args = fc.args as any;
             this.onMessage({ id: fc.id, role: 'model', text: `Initiating visual cortex for: ${args.prompt}...`, timestamp: new Date() });
             
             // Async generation to prevent timeout
             generateImage(args.prompt).then(imgResult => {
                if (imgResult.imageUrl) {
                    this.onMessage({
                        id: fc.id + '_res',
                        role: 'system',
                        text: args.prompt,
                        timestamp: new Date(),
                        metadata: { type: 'image_gen', image: imgResult.imageUrl }
                     });
                } else {
                    this.onMessage({
                        id: fc.id + '_err',
                        role: 'system',
                        text: `Visual generation failed: ${imgResult.error}`,
                        timestamp: new Date()
                     });
                }
             });

             // Immediate return to avoid deadline exceeded
             result = { result: "Image generation started in background. Inform the user it will be ready shortly." };

          } else if (fc.name === "reimagine_user") {
             const args = fc.args as any;
             const currentFrame = this.currentCameraFrame;

             if (!currentFrame) {
                 result = { error: "Camera frame not available. Please ensure camera is on." };
                 this.onMessage({
                    id: fc.id + '_err',
                    role: 'system',
                    text: `Error: Camera frame missing. Cannot reimagine user.`,
                    timestamp: new Date()
                 });
             } else {
                 const promptText = args.prompt || "A high quality professional portrait of the person";
                 this.onMessage({ 
                    id: fc.id, 
                    role: 'model', 
                    text: `Capturing webcam frame and processing with prompt: "${promptText}"...`, 
                    timestamp: new Date() 
                 });
                 
                 // Clean up the frame data (remove header if present)
                 const rawBase64 = currentFrame.replace(/^data:image\/\w+;base64,/, "");

                 // Async generation to prevent timeout
                 reimagineImage(rawBase64, promptText).then(imgResult => {
                    if (imgResult.imageUrl) {
                        this.onMessage({
                            id: fc.id + '_res',
                            role: 'system',
                            text: promptText,
                            timestamp: new Date(),
                            metadata: { type: 'reimagine', image: imgResult.imageUrl }
                         });
                    } else {
                        this.onMessage({
                            id: fc.id + '_err',
                            role: 'system',
                            text: `Reimagine failed: ${imgResult.error}`,
                            timestamp: new Date()
                        });
                    }
                 });
                 
                 // Immediate return
                 result = { result: "Photo captured and processing in background. Inform the user the image is rendering." };
             }
         } else if (fc.name === "play_music") {
                const args = fc.args as any;
                const query = args.query;
                const nativeUrl = `spotify:search:${encodeURIComponent(query)}`;
    const webUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    window.location.href = nativeUrl;
    setTimeout(() => { window.open(webUrl, '_blank'); }, 1500);
                result = { result: `Opened Spotify search for ${query}` };
                this.onMessage({
                  id: fc.id,
                  role: 'model',
                  text: `Opening Spotify for "${query}"...`,
                  timestamp: new Date()
                });
          } else if (fc.name === "open_youtube") {
  const args = fc.args as any;
  const query = args.query;
  const nativeUrl = `vnd.youtube://results?q=${encodeURIComponent(query)}`;
  const webUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  window.location.href = nativeUrl;
  setTimeout(() => { window.open(webUrl, '_blank'); }, 1500);
  result = { result: `Opened YouTube search for ${query}` };
  this.onMessage({
    id: fc.id,
    role: 'model',
    text: `Opening YouTube for "${query}"...`,
    timestamp: new Date()
  });
} else if (fc.name === "open_website") {
  const args = fc.args as any;
  const query = args.query;
  const looksLikeUrl = /^(https?:\/\/|www\.)/i.test(query) || /\.[a-z]{2,}(\/.*)?$/i.test(query);
  const url = looksLikeUrl
    ? (query.startsWith('http') ? query : `https://${query}`)
    : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  window.open(url, '_blank');
  result = { result: `Opened ${url}` };
  this.onMessage({
    id: fc.id,
    role: 'model',
    text: `Opening "${query}"...`,
    timestamp: new Date()
  });
          } else if (fc.name === "identify_song") {
  this.onMessage({
    id: fc.id,
    role: 'model',
    text: `Listening for the song...`,
    timestamp: new Date()
  });
  const audioBlob = await this.recordAmbientAudio(7000);
  const formData = new FormData();
  formData.append('api_token', 'cf4acca994838af918f11ffcd95861e6');
  formData.append('file', audioBlob, 'sample.webm');
  formData.append('return', 'spotify');
  const auddRes = await fetch('https://api.audd.io/', { method: 'POST', body: formData });
  const auddData = await auddRes.json();
  if (auddData.status === 'success' && auddData.result) {
    const song = auddData.result.title;
    const artist = auddData.result.artist;
    result = { result: `The song is "${song}" by ${artist}.` };
  } else {
    result = { result: "I couldn't identify this song. Ask the user to make sure music is playing clearly nearby, then try again." };
  }
            } else if (fc.name === "remember_fact") {
  const args = fc.args as any;
  const fact = args.fact;
  this.saveMemoryFact(fact);
  result = { result: `Got it, I'll remember that.` };
  this.onMessage({
    id: fc.id,
    role: 'model',
    text: `Remembered: "${fact}"`,
    timestamp: new Date()
  });
          }
        } catch (e: any) {
            result = { error: e.message };
        }

        // Send Response back to model
        await sessionPromise.then(session => {
            session.sendToolResponse({
                functionResponses: [{
                    id: fc.id,
                    name: fc.name,
                    response: result
                }]
            });
        });
      }
    }

    // 2. Handle Audio (Processed after tools to avoid blocking tool responses)
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.outputAudioContext) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      const pcmBytes = base64ToUint8Array(audioData);
      const audioBuffer = await pcm16ToAudioBuffer(pcmBytes, this.outputAudioContext);
      
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    }
  }
}
