# Savory

Savory es el inicio de una app social de restaurantes/comida construida con Expo, React Native, Expo Router y TypeScript. La prioridad actual es que funcione bien en web para desplegar en Vercel, dejando una estructura preparada para evolucionar despues a app movil iOS/Android.

La primera experiencia de la app es un mapa full-screen minimalista, con busqueda de restaurantes y sitios de comida/bebida mediante Google Maps Platform, navegacion inferior tipo app movil y una pantalla de perfil conectada a Supabase Auth.

## Estado Actual

La app tiene dos rutas principales:

- `/`: pantalla principal con mapa, buscador, marcador de ubicacion del usuario y menu inferior.
- `/profile`: pantalla de perfil, login, registro, cambio de contrasena y conexion con amigos con Supabase.
- `/list`: pantalla de lista con accesos a Deseados y Grupos, mas un desplegable de filtros.
- `/wishlist`: pantalla de Deseados con el mismo desplegable de filtros.
- `/groups`: pantalla de Grupos, actualmente vacia.

Tambien incluye:

- Google Maps JavaScript API en web.
- Google Places para busqueda de sitios.
- Supabase Auth para registro, login, confirmacion de correo y cambio de contrasena.
- Tabla publica `profiles` propuesta mediante migracion SQL con RLS.
- Tabla `friendships` propuesta mediante migracion SQL con RLS para solicitudes y amigos.
- Vercel Analytics y Speed Insights integrados solo en web.
- Separacion `.web.tsx` / `.native.tsx` para preparar compatibilidad movil.

## Stack

- Expo SDK 56
- React 19
- React Native 0.85
- Expo Router
- TypeScript estricto
- React Native Web
- Google Maps JavaScript API
- Google Places
- Supabase JS
- Vercel Analytics
- Vercel Speed Insights
- lucide-react-native para iconos

## Comandos

Instalar dependencias:

```bash
npm install
```

Arrancar en web:

```bash
npm run web
```

Equivalente:

```bash
npx expo start --web
```

Typecheck:

```bash
npm run typecheck
```

Build web para Vercel:

```bash
npm run build:web
```

Este comando ejecuta:

```bash
npx expo export --platform web
```

La salida estatica se genera en `dist`.

## Variables De Entorno

El proyecto usa variables publicas de Expo porque el codigo corre en cliente web. Todas deben empezar por `EXPO_PUBLIC_`.

Archivo de ejemplo:

```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Para local, existe un `.env` ignorado por Git. No se debe commitear.

Variables necesarias:

- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`: clave de Google Maps Platform.
- `EXPO_PUBLIC_SUPABASE_URL`: URL del proyecto Supabase.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key de Supabase.

Notas de seguridad:

- No usar service-role key de Supabase en frontend.
- No commitear `.env`.
- Restringir la Google Maps API key por dominio en Google Cloud cuando haya dominio final.
- La publishable key de Supabase puede estar en cliente, siempre que RLS este bien configurado.

## Despliegue En Vercel

En Vercel, usar:

- Application Preset: `Other`
- Root Directory: `./`
- Install Command: `npm install`
- Build Command: `npm run build:web`
- Output Directory: `dist`

Variables en Vercel:

```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=...
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Environment recomendado para las tres:

- `Production and Preview`

Solo usar `Development` si se va a trabajar con `vercel dev`.

## Supabase

La app usa Supabase para autenticacion:

- Registro con email y contrasena.
- Confirmacion de email.
- Login con email y contrasena.
- Sesion persistente.
- Cambio de contrasena.
- Busqueda de usuarios, solicitudes de amistad, bandeja de entrada y lista de amigos.

El cliente esta en:

```txt
services/supabase.ts
```

Se inicializa con:

```ts
createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});
```

### Auth vs Profiles

Supabase Auth guarda los usuarios en `auth.users`. Eso se ve en:

```txt
Supabase Dashboard > Authentication > Users
```

Para una red social, eso no basta. Por eso se anadio una migracion para crear una tabla publica `profiles`.

Migracion:

```txt
supabase/migrations/20260620114500_create_profiles.sql
```

Esta migracion crea:

```sql
public.profiles
```

Campos:

- `id uuid primary key references auth.users(id) on delete cascade`
- `username text not null`
- `display_name text`
- `avatar_url text`
- `created_at timestamptz`
- `updated_at timestamptz`

Tambien crea:

- indice unico case-insensitive para `username`
- RLS
- politicas de lectura publica
- politicas para que cada usuario cree/edite solo su propio perfil
- trigger `handle_new_user_profile` para crear perfil automaticamente tras registro
- backfill para usuarios ya existentes en `auth.users`

### Amistades

La conexion social usa:

```txt
supabase/migrations/20260620133000_create_friendships.sql
```

Esta migracion crea `public.friendships` con estados `pending` y `accepted`, RLS para que solo los participantes lean o borren relaciones, y una politica para que solo el receptor pueda aceptar una solicitud. Tambien habilita realtime en la tabla para refrescar bandeja, contador de solicitudes y lista de amigos.

### Como Aplicar La Migracion

Con las claves publicas de cliente no se pueden crear tablas. Hay que ejecutar el SQL desde Supabase:

```txt
Supabase Dashboard > SQL Editor
```

Pegar y ejecutar el contenido de:

```txt
supabase/migrations/20260620114500_create_profiles.sql
```

Si no se ejecuta esta migracion:

- Auth puede funcionar.
- Los usuarios apareceran en `Authentication > Users`.
- Pero la app no podra leer/escribir `public.profiles`.
- La pantalla de perfil mostrara un aviso indicando que falta la fila o la tabla.

### Configuracion De URLs En Supabase

En:

```txt
Authentication > URL Configuration
```

Configurar:

- Site URL: URL final de Vercel, por ejemplo `https://savory-app-oficial.vercel.app`
- Redirect URLs:
  - `https://savory-app-oficial.vercel.app/profile`
  - opcional para previews: `https://*.vercel.app/profile`

Esto es importante para la confirmacion de email y redireccion tras registro.

## Google Maps Y Places

La pantalla principal web usa Google Maps JavaScript API.

Archivo principal:

```txt
components/map/SavoryMap.web.tsx
```

Responsabilidades:

- Cargar Google Maps con `@googlemaps/js-api-loader`.
- Inicializar el mapa.
- Aplicar estilo visual blanco/gris/negro.
- Ocultar puntos de interes, comercios, iconos y ruido visual.
- Activar Google Places.
- Buscar sitios de comida/bebida.
- Centrar el mapa al seleccionar un resultado.
- Mostrar marcador coral para el sitio seleccionado.
- Pedir geolocalizacion del navegador.
- Mostrar ubicacion del usuario con un circulo azul y halo.
- Boton flotante para recentrar la ubicacion.

Estilo del mapa:

```txt
constants/mapStyle.ts
```

Constante:

```ts
SAVORY_MAP_STYLE
```

Servicio de normalizacion de Places:

```txt
services/googlePlaces.ts
```

Este servicio:

- normaliza predicciones de Google Places
- filtra/prioriza lugares relacionados con comida y bebida
- genera categorias legibles en espanol
- acorta direcciones
- transforma detalles de PlaceResult a `SavoryPlace`

Tipos:

```txt
types/place.ts
```

## Compatibilidad Web / Native

La app esta pensada primero para web, pero preparada para movil.

Mapa web:

```txt
components/map/SavoryMap.web.tsx
```

Mapa native:

```txt
components/map/SavoryMap.native.tsx
```

La version native ahora es un placeholder visual. La idea es reemplazarla mas adelante con `react-native-maps` u otra implementacion nativa, manteniendo los overlays compartidos.

Expo resuelve automaticamente:

- `.web.tsx` en web
- `.native.tsx` en iOS/Android

El archivo `app/index.tsx` importa:

```ts
import SavoryMap from "../components/map/SavoryMap";
```

No conoce detalles internos de plataforma.

## Pantalla Principal

Ruta:

```txt
app/index.tsx
```

Componentes principales:

- `SavoryMap`
- `PlacesSearch`
- `BottomNav`

UI:

- mapa a pantalla completa
- titulo `Savory` arriba
- boton de ubicacion encima del buscador
- buscador flotante abajo
- menu inferior con 5 iconos
- icono central de inicio destacado en coral

El buscador:

```txt
components/search/PlacesSearch.tsx
```

Caracteristicas:

- placeholder en espanol
- sin borde negro de focus en web
- cursor de texto visible
- ancho sincronizado con el menu inferior
- lista de resultados limpia
- estados de carga/error

## Pantalla De Perfil

Ruta:

```txt
app/profile.tsx
```

Componente:

```txt
components/profile/ProfileScreen.tsx
```

Si no hay sesion:

- muestra selector `Iniciar sesion` / `Registro`
- login: correo + contrasena
- registro: nombre de usuario + correo + contrasena + confirmar contrasena
- muestra aviso para confirmar correo

Si hay sesion:

- muestra username/display name desde `public.profiles`
- muestra correo del usuario
- avisa si el correo no esta confirmado
- boton de cambiar contrasena
- boton de cerrar sesion

Cambio de contrasena:

- muestra modal/seccion superior
- pide contrasena antigua
- nueva contrasena
- confirmar nueva contrasena
- reautentica con `signInWithPassword`
- luego ejecuta `updateUser({ password })`

## Navegacion Inferior

Archivo:

```txt
components/navigation/BottomNav.tsx
```

Iconos:

1. Contraer
2. Lista
3. Inicio
4. Cuadricula
5. Perfil

Actualmente:

- Inicio navega a `/`
- Lista navega a `/list`
- Perfil navega a `/profile`
- El icono de Lista tambien queda activo en `/wishlist` y `/groups`
- Los iconos de Contraer y Cuadricula son placeholders visuales

Se usa `expo-router`:

```ts
useRouter()
usePathname()
```

El item activo se detecta por ruta.

## Paginas De Lista, Deseados Y Grupos

Se anadieron tres rutas relacionadas con el icono de lista del menu inferior:

```txt
app/list.tsx
app/wishlist.tsx
app/groups.tsx
```

Componentes:

```txt
components/list/ListHubScreen.tsx
components/list/WishlistScreen.tsx
components/list/GroupsScreen.tsx
components/list/ListPageShell.tsx
components/list/FiltersDropdown.tsx
```

`/list` muestra:

- titulo `Lista`
- dos botones rectangulares, uno junto al otro:
  - `Deseados`, navega a `/wishlist`
  - `Grupos`, navega a `/groups`
- debajo, un desplegable `Filtros`

`/wishlist` muestra:

- titulo `Deseados`
- boton `Volver` para regresar a la pagina anterior
- el mismo desplegable `Filtros`

`/groups` muestra:

- titulo `Grupos`
- boton `Volver` para regresar a la pagina anterior
- contenido vacio por ahora

El desplegable `Filtros` ocupa el mismo ancho que el grupo de botones. Por ahora esta vacio a proposito: abre un panel sin opciones hasta que existan filtros reales y datos persistidos.

## Vercel Analytics Y Speed Insights

Se integro Vercel Analytics para pageviews y Vercel Speed Insights para Core Web Vitals.

Archivos:

```txt
components/analytics/VercelAnalytics.web.tsx
components/analytics/VercelAnalytics.native.tsx
components/analytics/VercelSpeedInsights.web.tsx
components/analytics/VercelSpeedInsights.native.tsx
```

En web:

```tsx
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
```

En native:

```tsx
return null;
```

Se incluye en:

```txt
app/_layout.tsx
```

Asi Analytics y Speed Insights solo cargan en web y no afectan a iOS/Android cuando se construya la app movil.

## Layout Raiz

Archivo:

```txt
app/_layout.tsx
```

Responsabilidades:

- `SafeAreaProvider`
- `StatusBar`
- Stack de Expo Router sin headers
- Vercel Analytics
- Vercel Speed Insights

## Tema Visual

Archivo:

```txt
constants/theme.ts
```

Contiene:

- paleta blanco/gris/negro
- coral `#FF6B5F`
- radios
- espaciados
- sombra flotante reutilizable

El look busca sentirse como una app moderna tipo Uber/Bolt:

- limpia
- premium
- pocos colores
- overlays flotantes
- mapa sin ruido visual

## Iconos

Se usa:

```txt
lucide-react-native
```

Hay un wrapper:

```txt
components/ui/SavoryIcon.tsx
```

Motivo:

- las props de lucide/react-native pueden tener tipos incomodos con React Native Web
- el wrapper centraliza `color`, `stroke`, `size`, `strokeWidth`
- evita casts repetidos en cada componente

## Seguridad

Decisiones importantes:

- No se guarda service-role key de Supabase.
- Supabase Auth se usa con publishable key.
- Los datos publicos de perfil van en `public.profiles`.
- RLS esta activado en `profiles`.
- Cada usuario solo puede insertar/actualizar su propio perfil.
- Los perfiles son publicamente leibles, porque en una red social normalmente el username/avatar deben poder verse.
- Las contrasenas nunca se guardan ni loguean en la app.
- El cambio de contrasena reautentica con la contrasena antigua antes de llamar a `updateUser`.
- Mensajes de error de auth son relativamente genericos para no filtrar demasiado.
- `.env` esta ignorado por Git.
- Google Maps API key debe restringirse por dominio en Google Cloud.

## Notas Importantes Para Futuro Codex

1. No hardcodear claves nuevas en codigo fuente.
2. Mantener variables cliente con prefijo `EXPO_PUBLIC_`.
3. No introducir APIs de navegador dentro de archivos `.native.tsx`.
4. Si se toca el mapa web, revisar `SavoryMap.web.tsx`; si se toca movil, crear/editar `SavoryMap.native.tsx`.
5. Si se anaden datos sociales, crear tablas con RLS y migraciones SQL en `supabase/migrations`.
6. No asumir que la tabla `profiles` existe en remoto: depende de que se haya ejecutado la migracion.
7. Para Vercel, el output es `dist`, no `.next`.
8. El preset de Vercel debe ser `Other`.
9. Si se agregan rutas nuevas, revisar `BottomNav` si deben estar navegables.
10. El proyecto puede tener `.env` local, pero no debe subirse.

## Archivos Clave

```txt
app/_layout.tsx
app/index.tsx
app/profile.tsx
components/map/SavoryMap.web.tsx
components/map/SavoryMap.native.tsx
components/search/PlacesSearch.tsx
components/navigation/BottomNav.tsx
components/list/ListHubScreen.tsx
components/list/WishlistScreen.tsx
components/list/GroupsScreen.tsx
components/list/ListPageShell.tsx
components/list/FiltersDropdown.tsx
components/profile/ProfileScreen.tsx
components/analytics/VercelAnalytics.web.tsx
components/analytics/VercelAnalytics.native.tsx
components/analytics/VercelSpeedInsights.web.tsx
components/analytics/VercelSpeedInsights.native.tsx
components/ui/SavoryIcon.tsx
constants/theme.ts
constants/mapStyle.ts
services/googlePlaces.ts
services/supabase.ts
types/place.ts
types/env.d.ts
supabase/migrations/20260620114500_create_profiles.sql
```

## Flujo De Registro

1. Usuario abre `/profile`.
2. Selecciona `Registro`.
3. Introduce username, correo, contrasena y confirmacion.
4. La app valida:
   - username entre 3 y 32 caracteres
   - email con formato valido
   - contrasena minimo 10 caracteres
   - confirmacion igual
5. Llama a `supabase.auth.signUp`.
6. Supabase envia email de confirmacion.
7. Si la migracion esta aplicada, el trigger crea `public.profiles`.
8. El usuario confirma desde su correo.
9. Puede iniciar sesion.

## Flujo De Login

1. Usuario introduce correo y contrasena.
2. La app llama a `supabase.auth.signInWithPassword`.
3. Supabase devuelve sesion.
4. La pantalla carga `public.profiles` por `id = auth.user.id`.
5. Si no existe perfil, la app intenta crear uno propio usando RLS.

## Flujo De Mapa

1. App carga `/`.
2. `SavoryMap.web.tsx` lee `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`.
3. Carga librerias `maps` y `places`.
4. Inicializa mapa en una posicion por defecto.
5. Pide ubicacion del navegador.
6. Si el usuario acepta:
   - centra mapa
   - dibuja circulo azul
   - dibuja halo de precision
7. Usuario escribe en buscador.
8. Places devuelve predicciones.
9. La app filtra/prioriza comida y bebida.
10. Al seleccionar resultado:
   - pide detalles
   - centra mapa
   - dibuja marcador coral

## Problemas Comunes

### El mapa no aparece

Revisar:

- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
- que la API key este habilitada para Maps JavaScript API
- que Places API este habilitada
- restricciones de dominio en Google Cloud

### No aparecen resultados de busqueda

Revisar:

- Places API habilitada
- billing de Google Cloud activo
- consola del navegador
- restricciones de la API key

### El usuario aparece en Auth pero no en profiles

Eso significa que Supabase Auth funciona, pero falta la tabla/trigger o la migracion no se ejecuto.

Solucion:

- ejecutar `supabase/migrations/20260620114500_create_profiles.sql`
- comprobar `public.profiles` en Table Editor
- comprobar politicas RLS

### El correo de confirmacion no redirige bien

Revisar Supabase:

```txt
Authentication > URL Configuration
```

Anadir:

```txt
https://tu-dominio.vercel.app/profile
```

### Vercel no construye

Revisar:

- Preset: `Other`
- Build Command: `npm run build:web`
- Output Directory: `dist`
- Variables `EXPO_PUBLIC_*`

## Pendientes Naturales

Posibles siguientes pasos:

- Editar perfil publico desde la app.
- Subida de avatar a Supabase Storage.
- Guardar restaurantes favoritos.
- Crear tabla `saved_places`.
- Crear tabla `recommendations`.
- Implementar feeds sociales.
- Implementar pantalla de lista.
- Implementar pantalla de favoritos.
- Sustituir placeholder native por `react-native-maps`.
- Anadir tests de componentes/servicios.
- Revisar Speed Insights en Vercel tras desplegar y visitar la web para ver Core Web Vitals reales.
