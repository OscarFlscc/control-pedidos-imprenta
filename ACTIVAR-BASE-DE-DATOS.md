# Activar la base de datos en línea

La página ya está lista para compartir los mismos pedidos entre distintos equipos. Solo necesitas conectarla una vez a una cuenta gratuita de Supabase y publicarla en internet. No se utiliza ChatGPT para entrar.

## 1. Crea tu espacio de datos

1. Abre [Supabase](https://supabase.com/dashboard) y crea una cuenta del negocio.
2. Crea un proyecto nuevo y espera a que esté listo.
3. En el menú **SQL Editor**, crea una consulta nueva, abre el archivo `database.sql` de esta carpeta, copia todo su contenido y ejecútalo.
4. Ve a **Authentication > Users** y agrega el correo y contraseña que usarás para entrar al control de pedidos. Guarda esos datos en un lugar seguro.

## 2. Conecta la página

1. En Supabase, abre **Project Settings > API**.
2. Copia la **Project URL** y la clave pública **Publishable key** (si aparece como `anon key`, también funciona).
3. Abre el archivo `config.js` de esta carpeta y pega ambos datos entre las comillas correspondientes.

No uses ni compartas una clave llamada `service_role` o `secret`: esa clave no debe ir en una página web.

## 3. Publícala

Sube toda esta carpeta a un servicio de páginas web estáticas, como Netlify o Cloudflare Pages. Recibirás una dirección web; abre esa misma dirección desde cualquier dispositivo, inicia con el correo y contraseña del negocio y verás los mismos pedidos.

Antes de publicarla, en Supabase abre **Authentication > URL Configuration** y agrega la dirección final de tu página en las URLs permitidas. Así el acceso funciona correctamente desde la página publicada.

## Importante

Los pedidos quedan privados: solo la persona que entre con ese correo y contraseña puede verlos. Puedes usar el mismo acceso en tus propios dispositivos. Si deseas dar acceso a personal adicional con su propio correo pero viendo los mismos pedidos, se puede añadir como siguiente mejora.
