# Pitwall · Dashboard de F1

Landing page y dashboard minimalista de Fórmula 1 con datos abiertos de la [API de Jolpica](https://github.com/jolpica/jolpica-f1) (sucesora de Ergast). Sin clave ni pago.

## Qué muestra

- Líder de pilotos y constructores, carreras disputadas y ganadores distintos
- Próximo Gran Premio con cuenta atrás y sesiones en hora local
- Último Gran Premio: podio, pole, vuelta rápida, remontada y abandonos
- Clasificación de pilotos y constructores
- Evolución de puntos del top 5 (sprints incluidos)
- Calendario con ganadores
- Selector de temporada (1950 → actual)

## Uso

Es HTML, CSS y JavaScript sin build. Sirve la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 5178
```

y abre http://localhost:5178.

## Estructura

```
index.html       Landing
dashboard.html   Dashboard
css/styles.css   Estilos (modo claro/oscuro automático)
js/api.js        Cliente de la API con caché y control de límite de peticiones
js/dashboard.js  Render del dashboard
```

Proyecto no oficial, sin relación con Formula 1.
