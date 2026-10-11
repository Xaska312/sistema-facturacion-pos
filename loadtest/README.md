# Prueba de carga (k6)

Simula la hora pico de **50 tiendas** (la meta de lanzamiento) y dice si el sistema la aguanta con tiempos buenos.
La escribe `carga.js`, la corre [k6](https://grafana.com/docs/k6/) dentro de Docker. No hay que instalar nada.

## Qué simula

| Quién | Cuántos | Qué hace |
|---|---|---|
| Cajeros | 2 por tienda (100) | Leen de 1 a 4 productos con el lector y cobran en efectivo; una venta cada ~6 s cada uno |
| Dueños | 1 de cada 5 tiendas (10) | Miran el tablero, la lista de ventas y las existencias cada ~20 s |
| Exportaciones | 2 por minuto | Descargan el CSV de ventas del día (consulta pesada) |

Una venta cada 6 s por caja es unas 5 veces el ritmo de una tienda de barrio en hora pico: deja margen.

Antes de medir, la prueba prepara las tiendas (2–5 minutos): crea dueño, negocio, 20 productos con existencia, una
segunda caja y un cajero invitado, y abre las dos cajas.

## Cómo correrla en tu PC (PowerShell)

Usa un proyecto de Docker aparte (`-p poscarga`) con su propia base de datos: **tus datos de desarrollo no se tocan**.
Pero como los contenedores tienen nombre fijo, primero hay que bajar los de desarrollo (sin `-v`, los datos quedan).

```powershell
cd C:\Users\danii\Documents\GitHub\Pos-Hibrid-Dan
docker compose down

# 1. Levantar base de datos y backend para la prueba (la primera vez compila, ~3 min)
docker compose -p poscarga -f docker-compose.yml -f loadtest/compose.carga.yml up -d --build postgres-db mailpit backend

# 2. Correr la prueba (preparación + 10 minutos de carga)
docker compose -p poscarga -f docker-compose.yml -f loadtest/compose.carga.yml run --rm k6

# 3. Borrar todo lo de la prueba (base de datos de carga incluida) y volver a desarrollo
docker compose -p poscarga -f docker-compose.yml -f loadtest/compose.carga.yml down -v
docker compose up -d
```

Para una prueba corta (por ejemplo, para ver que todo arranca), antes del paso 2:

```powershell
$env:TIENDAS = "5"; $env:DURACION = "2m"
```

Variables: `TIENDAS` (50), `PRODUCTOS` por tienda (20), `DURACION` (10m), `PAUSA_VENTA` en segundos (6).

También se puede correr en GitHub: pestaña **Actions → Prueba de carga → Run workflow** (~20 min de Actions). Deja
los resultados como artefacto, con el uso de CPU y memoria de cada contenedor.

## En el servidor de pruebas (antes de abrir)

La medida que decide abrir a clientes se toma en un servidor igual al de producción, **sin clientes** (nunca en
producción: la prueba crea 50 negocios y 100 usuarios). Solo en ese servidor, agrega al `.env` y reinicia el backend:

```
EMAIL_VERIFICATION_REQUIRED=false
RATE_LIMIT_LOGIN=100000
RATE_LIMIT_REGISTER=100000
JWT_ACCESS_TTL=PT3H
```

Luego, desde tu PC (k6 en Docker, apuntando al dominio de pruebas; Caddy publica la salud del backend en `/healthz`):

```powershell
cd C:\Users\danii\Documents\GitHub\Pos-Hibrid-Dan\loadtest
docker run --rm -v "${PWD}:/carga" -w /carga -e BASE_URL=https://pruebas.tu-dominio.com `
  -e HEALTH_URL=https://pruebas.tu-dominio.com/healthz grafana/k6:1.0.0 run carga.js
```

Al terminar, **quita esas cuatro líneas del `.env`** y reinicia el backend: son exactamente lo que protege a
producción (correo confirmado, límites de intentos y sesiones cortas). Lo ideal es recrear la base de datos de pruebas.

## Cómo leer el resultado

Al final aparece un resumen en español; se guarda también en `loadtest/resultados/resumen.txt`.

| Umbral | Por qué |
|---|---|
| Venta: p95 < 800 ms, p99 < 2 s | Lo que espera el cajero después de "Registrar venta" |
| Lector: p95 < 300 ms | Cada lectura del código debe sentirse inmediata |
| Tablero: p95 < 1,5 s | El dueño mirando su día |
| Errores de cajeros < 1 % y verificaciones > 99 % | Una venta que falla es una venta perdida |

"p95 = 800 ms" quiere decir que 95 de cada 100 ventas respondieron en menos de 800 ms. Un **429** en exportaciones
no es un error: es el cupo de consultas pesadas (decisión 217) protegiendo a los cajeros.

Si sale **NO APROBADA**, el resumen dice qué umbral falló. Lo más común:

- **Ventas lentas pero sin errores**: el equipo está al límite. Prueba con `TIENDAS=25`: si con la mitad aprueba, el
  límite está entre las dos.
- **503 "El sistema está ocupado"**: el pool de conexiones (10 por defecto, `DB_POOL_SIZE`) se llenó.
- **Errores en la preparación**: revisa `docker compose -p poscarga logs backend`.

## Importante

- Tu PC no es el servidor: corre al mismo tiempo la base, el backend y k6, con Windows y Docker Desktop de por medio.
  Si aprueba en tu PC, en un servidor dedicado de 4 GB debería ir igual o mejor. La medida que cuenta es la del servidor
  real, al desplegar (se repetirá allá con `BASE_URL` apuntando al servidor de pruebas, nunca al de producción con
  clientes).
- Cada ejecución crea negocios nuevos. Por eso va en su propio proyecto (`poscarga`) y se borra con `down -v`.
