export default async function handler(req: any, res: any) {
  const city = req.query.city || 'Cayambe,EC';
  const apiKey = process.env.OPENWEATHER_API_KEY;

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=es`
    );
    const data = await response.json();

    if (data.cod !== 200) {
      return res.status(500).json({ error: data.message || 'Error del servicio de clima' });
    }

    res.status(200).json({
      description: data.weather[0].description,
      temp: Math.round(data.main.temp),
      city: data.name
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo obtener el clima' });
  }
}
