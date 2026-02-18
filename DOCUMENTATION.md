# Newsletter Automation: Notion → Sendy + Astro Blog

## 📋 Overview

Sistema automatizado para publicar newsletters que:
1. ✅ Lee contenido desde Notion
2. ✅ Crea archivo `.md` en blog Astro
3. ✅ Hace commit automático a GitHub
4. ✅ Envía newsletter vía Sendy API
5. ✅ Actualiza Notion con status y URLs

**Resultado**: Escribes en Notion desde el móvil, marcas 2 checkboxes, y todo se publica automáticamente.

---

## 🏗️ Arquitectura
```
┌─────────────┐
│   Notion    │ → Base de datos con newsletters
│  (Mobile)   │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────────────┐
│  GitHub Actions (cada 15 min)      │
│  - Lee Notion                       │
│  - Crea .md en repo                 │
│  - Envía a Sendy                    │
│  - Actualiza Notion                 │
└──────┬──────────────────────────────┘
       │
       ├──→ ┌──────────────┐
       │    │ GitHub Repo  │ → Astro Blog
       │    └──────────────┘
       │
       └──→ ┌──────────────┐
            │   Sendy      │ → Email subscribers
            └──────────────┘
```

---

## 📦 Estructura del Proyecto
```
newsletter-automation/
│
├── blog/                          # Proyecto Astro (repo separado)
│   ├── src/
│   │   ├── content/
│   │   │   ├── config.ts
│   │   │   └── newsletters/      # Aquí se crean los .md
│   │   │       ├── 2025-02-14-titulo-post.md
│   │   │       └── ...
│   │   ├── pages/
│   │   │   └── newsletter/
│   │   │       ├── index.astro   # Lista de newsletters
│   │   │       └── [slug].astro  # Post individual
│   │   └── layouts/
│   │       └── Layout.astro
│   ├── astro.config.mjs
│   └── package.json
│
└── sync-service/                  # Proyecto Node.js (repo separado)
    ├── sync-newsletter.js         # Script principal
    ├── package.json
    ├── .github/
    │   └── workflows/
    │       └── sync.yml           # GitHub Action
    └── .env.example
```

---

## ✅ Requisitos Previos

1. **Cuenta Notion** (plan gratuito funciona)
2. **Cuenta GitHub** 
3. **Servidor Sendy** (ya lo tienes)
4. **Cuenta Vercel/Netlify** (para hospedar blog Astro - gratuito)

---

## 🔧 Setup Paso a Paso

### PASO 1: Crear Base de Datos en Notion

#### Propiedades de la Database:

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| **Título** | Title | Título del newsletter |
| **Contenido** | Text | Contenido en texto plano (300-400 palabras) |
| **Subject** | Text | Asunto del email |
| **Fecha Publicación** | Date | Fecha de publicación |
| **Lista Sendy** | Select | Opciones: Principal, Pro, Empresarios |
| **✅ Listo para publicar** | Checkbox | Marca cuando esté listo |
| **📤 Enviar ahora** | Checkbox | Marca para enviar |
| **Status** | Select | Opciones: Draft, Sent, Error |
| **Campaign ID** | Text | ID de Sendy (auto) |
| **URL Blog** | URL | Link al post (auto) |

#### Obtener Database ID:
1. Abre la database en Notion
2. Copia la URL: `https://notion.so/workspace/1234567890abcdef...?v=...`
3. El Database ID es: `1234567890abcdef` (32 caracteres)

#### Crear Integración de Notion:
1. Ve a https://www.notion.so/my-integrations
2. Click "New integration"
3. Nombre: "Newsletter Automation"
4. Guarda el **Internal Integration Token**
5. En tu database Notion → Click `...` → Add connections → Selecciona tu integración

---

### PASO 2: Crear Repositorio del Blog (Astro)
```bash
# Crear proyecto Astro
npm create astro@latest blog-newsletter
cd blog-newsletter

# Instalar dependencias
npm install
npm install @astrojs/tailwind
npx astro add tailwind
```

#### `src/content/config.ts`
```typescript
import { defineCollection, z } from 'astro:content';

const newslettersCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    description: z.string(),
    subject: z.string(),
    sentToList: z.string(),
    campaignId: z.string().optional(),
  }),
});

export const collections = {
  newsletters: newslettersCollection,
};
```

#### `src/pages/archivo.astro`
```astro
---
import { getCollection } from 'astro:content';
import Layout from '../../layouts/Layout.astro';

const newsletters = await getCollection('newsletters');
const sortedNewsletters = newsletters.sort(
  (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);

const newslettersByYear = sortedNewsletters.reduce((acc, newsletter) => {
  const year = newsletter.data.pubDate.getFullYear();
  if (!acc[year]) acc[year] = [];
  acc[year].push(newsletter);
  return acc;
}, {} as Record<number, typeof newsletters>);
---

<Layout title="Archivo de Newsletters - TodoConta">
  <main class="max-w-4xl mx-auto px-4 py-12">
    <header class="mb-12">
      <h1 class="text-4xl font-bold mb-4">Archivo de Newsletters</h1>
      <p class="text-xl text-gray-600">
        Todos los boletines diarios de TodoConta
      </p>
    </header>

    {Object.entries(newslettersByYear)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, yearNewsletters]) => (
        <section class="mb-12">
          <h2 class="text-2xl font-bold mb-6 text-gray-800">{year}</h2>
          <div class="space-y-4">
            {yearNewsletters.map(newsletter => (
              <article class="border-l-4 border-blue-500 pl-4 py-2 hover:bg-gray-50 transition">
                <time class="text-sm text-gray-500">
                  {newsletter.data.pubDate.toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </time>
                <h3 class="text-xl font-semibold mt-1">
                  <a 
                    href={`/${newsletter.slug}`}
                    class="hover:text-blue-600 transition"
                  >
                    {newsletter.data.title}
                  </a>
                </h3>
                <p class="text-gray-600 mt-1">{newsletter.data.description}</p>
              </article>
            ))}
          </div>
        </section>
      ))
    }
  </main>
</Layout>
```

#### `src/pages/[slug].astro`
```astro
---
import { getCollection } from 'astro:content';
import Layout from '../../layouts/Layout.astro';

export async function getStaticPaths() {
  const newsletters = await getCollection('newsletters');
  return newsletters.map(newsletter => ({
    params: { slug: newsletter.slug },
    props: { newsletter },
  }));
}

const { newsletter } = Astro.props;
const { Content } = await newsletter.render();
---

<Layout title={`${newsletter.data.title} - TodoConta`}>
  <article class="max-w-3xl mx-auto px-4 py-12">
    <header class="mb-8">
      <a 
        href="/newsletter" 
        class="text-blue-600 hover:underline mb-4 inline-block"
      >
        ← Volver al archivo
      </a>
      
      <time class="block text-gray-500 mb-2">
        {newsletter.data.pubDate.toLocaleDateString('es-MX', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}
      </time>
      
      <h1 class="text-4xl font-bold mb-4">{newsletter.data.title}</h1>
      
      <p class="text-sm text-gray-500">
        Enviado a: {newsletter.data.sentToList}
      </p>
    </header>
    
    <div class="prose prose-lg max-w-none">
      <Content />
    </div>
    
    <footer class="mt-12 pt-8 border-t">
      <p class="text-gray-600">
        📧 ¿Quieres recibir estos newsletters? 
        <a href="/suscribirse" class="text-blue-600 hover:underline">
          Suscríbete aquí
        </a>
      </p>
    </footer>
  </article>
</Layout>
```

#### `src/layouts/Layout.astro`
```astro
---
interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="generator" content={Astro.generator} />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
```

**Push a GitHub:**
```bash
git init
git add .
git commit -m "Initial blog setup"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/newsletter-blog.git
git push -u origin main
```

**Deploy en Vercel:**
1. Importa el repo en Vercel
2. Framework preset: Astro
3. Deploy

---

### PASO 3: Crear Servicio de Sincronización

Crear nuevo repo `newsletter-sync-service`

#### `package.json`
```json
{
  "name": "newsletter-sync-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "sync": "node sync-newsletter.js"
  },
  "dependencies": {
    "@notionhq/client": "^2.2.15",
    "@octokit/rest": "^20.0.2",
    "date-fns": "^3.3.1",
    "node-fetch": "^3.3.2"
  }
}
```

#### `sync-newsletter.js`
```javascript
import { Client } from '@notionhq/client';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es.mjs';

// ============================================
// CONFIGURACIÓN
// ============================================

const CONFIG = {
  notion: {
    token: process.env.NOTION_TOKEN,
    databaseId: process.env.NOTION_DATABASE_ID,
  },
  github: {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER, // tu usuario de GitHub
    repo: process.env.GITHUB_REPO,   // nombre del repo del blog
    branch: 'main',
  },
  sendy: {
    apiUrl: process.env.SENDY_API_URL,
    apiKey: process.env.SENDY_API_KEY,
    brandId: process.env.SENDY_BRAND_ID || '1',
    fromName: process.env.SENDY_FROM_NAME || 'Isaac Castro - TodoConta',
    fromEmail: process.env.SENDY_FROM_EMAIL || '[email protected]',
    replyTo: process.env.SENDY_REPLY_TO || '[email protected]',
  },
  blog: {
    baseUrl: process.env.BLOG_BASE_URL || 'https://columna13.club',
  }
};

// Mapeo de listas de Sendy
const SENDY_LISTS = {
  'Principal': process.env.SENDY_LIST_PRINCIPAL,
  'Pro': process.env.SENDY_LIST_PRO,
  'Empresarios': process.env.SENDY_LIST_EMPRESARIOS,
};

// ============================================
// CLIENTES
// ============================================

const notion = new Client({ auth: CONFIG.notion.token });
const octokit = new Octokit({ auth: CONFIG.github.token });

// ============================================
// FUNCIONES AUXILIARES
// ============================================

/**
 * Genera slug a partir del título
 */
function generateSlug(title, date) {
  const fechaFormato = format(new Date(date), 'yyyy-MM-dd');
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  
  return `${fechaFormato}-${slug}`;
}

/**
 * Convierte contenido de texto plano a HTML simple
 */
function textToHtml(text) {
  return text
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p style="line-height: 1.6; margin-bottom: 16px;">${p.trim()}</p>`)
    .join('\n');
}

/**
 * Crea el HTML del email
 */
function createEmailHtml(contenido, slug) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Newsletter</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; background-color: #f9fafb;">
  
  <div style="background-color: white; padding: 30px; border-radius: 8px;">
    ${textToHtml(contenido)}
  </div>
  
  <div style="margin-top: 30px; padding: 20px; text-align: center; font-size: 14px; color: #666;">
    <p>
      <a href="${CONFIG.blog.baseUrl}/${slug}" style="color: #3b82f6; text-decoration: none;">Ver en navegador</a>
      &nbsp;•&nbsp;
      <a href="[unsubscribe]" style="color: #3b82f6; text-decoration: none;">Desuscribirse</a>
    </p>
    <p style="margin-top: 10px; font-size: 12px; color: #999;">
      TodoConta - Contenido diario para contadores
    </p>
  </div>
  
</body>
</html>
  `.trim();
}

/**
 * Crea frontmatter markdown
 */
function createMarkdownFile(data) {
  const { titulo, contenido, subject, descripcion, fecha, lista, campaignId } = data;
  
  return `---
title: "${titulo}"
pubDate: ${new Date(fecha).toISOString()}
description: "${descripcion}"
subject: "${subject}"
sentToList: "${lista}"
${campaignId ? `campaignId: "${campaignId}"` : ''}
---

${contenido}
`;
}

/**
 * Crea/actualiza archivo en GitHub
 */
async function commitToGithub(filePath, content, message) {
  try {
    // Verificar si el archivo existe
    let sha;
    try {
      const { data } = await octokit.repos.getContent({
        owner: CONFIG.github.owner,
        repo: CONFIG.github.repo,
        path: filePath,
        ref: CONFIG.github.branch,
      });
      sha = data.sha;
    } catch (error) {
      // Archivo no existe, está bien
    }

    // Crear o actualizar
    await octokit.repos.createOrUpdateFileContents({
      owner: CONFIG.github.owner,
      repo: CONFIG.github.repo,
      path: filePath,
      message: message,
      content: Buffer.from(content).toString('base64'),
      branch: CONFIG.github.branch,
      ...(sha && { sha }),
    });

    return true;
  } catch (error) {
    console.error('❌ Error en GitHub:', error.message);
    return false;
  }
}

/**
 * Envía campaña a Sendy
 */
async function sendToSendy(data) {
  const { subject, htmlContent, listaId } = data;

  const formData = new URLSearchParams({
    api_key: CONFIG.sendy.apiKey,
    from_name: CONFIG.sendy.fromName,
    from_email: CONFIG.sendy.fromEmail,
    reply_to: CONFIG.sendy.replyTo,
    subject: subject,
    html_text: htmlContent,
    list_ids: listaId,
    send_campaign: '1',
    brand_id: CONFIG.sendy.brandId,
  });

  try {
    const response = await fetch(`${CONFIG.sendy.apiUrl}/api/campaigns/create.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    const result = await response.text();
    
    // Sendy devuelve el campaign ID si es exitoso
    // o un mensaje de error
    if (result.includes('Campaign created') || !isNaN(result)) {
      return { success: true, campaignId: result };
    } else {
      return { success: false, error: result };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Actualiza página de Notion
 */
async function updateNotionPage(pageId, updates) {
  try {
    const properties = {};

    if (updates.status) {
      properties.Status = { select: { name: updates.status } };
    }

    if (updates.hasOwnProperty('enviarAhora')) {
      properties['📤 Enviar ahora'] = { checkbox: updates.enviarAhora };
    }

    if (updates.campaignId) {
      properties['Campaign ID'] = { 
        rich_text: [{ text: { content: updates.campaignId } }] 
      };
    }

    if (updates.urlBlog) {
      properties['URL Blog'] = { url: updates.urlBlog };
    }

    await notion.pages.update({
      page_id: pageId,
      properties,
    });

    return true;
  } catch (error) {
    console.error('❌ Error actualizando Notion:', error.message);
    return false;
  }
}

// ============================================
// FUNCIÓN PRINCIPAL
// ============================================

async function procesarNewsletters() {
  console.log('🚀 Iniciando sincronización de newsletters...\n');

  try {
    // 1. Query a Notion
    const response = await notion.databases.query({
      database_id: CONFIG.notion.databaseId,
      filter: {
        and: [
          {
            property: '✅ Listo para publicar',
            checkbox: { equals: true },
          },
          {
            property: '📤 Enviar ahora',
            checkbox: { equals: true },
          },
          {
            or: [
              {
                property: 'Status',
                select: { does_not_equal: 'Sent' },
              },
              {
                property: 'Status',
                select: { is_empty: true },
              },
            ],
          },
        ],
      },
    });

    if (response.results.length === 0) {
      console.log('✅ No hay newsletters pendientes de enviar.');
      return;
    }

    console.log(`📝 Encontradas ${response.results.length} newsletter(s) para procesar\n`);

    // 2. Procesar cada newsletter
    for (const page of response.results) {
      const pageId = page.id;
      
      try {
        // Extraer datos
        const props = page.properties;
        const titulo = props['Título']?.title?.[0]?.plain_text || 'Sin título';
        const contenido = props['Contenido']?.rich_text?.[0]?.plain_text || '';
        const subject = props['Subject']?.rich_text?.[0]?.plain_text || titulo;
        const lista = props['Lista Sendy']?.select?.name || 'Principal';
        const fecha = props['Fecha Publicación']?.date?.start || new Date().toISOString();
        
        // Validar lista
        if (!SENDY_LISTS[lista]) {
          throw new Error(`Lista "${lista}" no configurada en SENDY_LISTS`);
        }

        console.log(`📄 Procesando: "${titulo}"`);
        console.log(`   Lista: ${lista}`);
        console.log(`   Fecha: ${fecha}`);

        // Generar slug y descripción
        const slug = generateSlug(titulo, fecha);
        const descripcion = contenido.substring(0, 160).trim() + '...';

        // 3. Crear archivo .md en GitHub
        console.log('   → Creando archivo en GitHub...');
        const filePath = `src/content/newsletters/${slug}.md`;
        const markdownContent = createMarkdownFile({
          titulo,
          contenido,
          subject,
          descripcion,
          fecha,
          lista,
        });

        const githubSuccess = await commitToGithub(
          filePath,
          markdownContent,
          `Newsletter: ${titulo}`
        );

        if (!githubSuccess) {
          throw new Error('Error al crear archivo en GitHub');
        }
        console.log('   ✅ Archivo creado en GitHub');

        // 4. Enviar a Sendy
        console.log('   → Enviando newsletter...');
        const htmlContent = createEmailHtml(contenido, slug);
        const sendyResult = await sendToSendy({
          subject,
          htmlContent,
          listaId: SENDY_LISTS[lista],
        });

        if (!sendyResult.success) {
          throw new Error(`Sendy error: ${sendyResult.error}`);
        }
        console.log('   ✅ Newsletter enviada');

        // 5. Actualizar Notion
        console.log('   → Actualizando Notion...');
        const urlBlog = `${CONFIG.blog.baseUrl}/${slug}`;
        await updateNotionPage(pageId, {
          status: 'Sent',
          enviarAhora: false,
          campaignId: sendyResult.campaignId,
          urlBlog,
        });
        console.log('   ✅ Notion actualizado');
        console.log(`   🔗 URL: ${urlBlog}\n`);

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);
        
        // Marcar como error en Notion
        await updateNotionPage(pageId, {
          status: 'Error',
          enviarAhora: false,
        });
      }
    }

    console.log('✅ Sincronización completada\n');

  } catch (error) {
    console.error('❌ Error general:', error.message);
    process.exit(1);
  }
}

// ============================================
// EJECUTAR
// ============================================

procesarNewsletters();
```

#### `.env.example`
```bash
# Notion
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=tu-usuario
GITHUB_REPO=newsletter-blog

# Sendy
SENDY_API_URL=https://tu-dominio.com/sendy
SENDY_API_KEY=tu_api_key_de_sendy
SENDY_BRAND_ID=1
SENDY_FROM_NAME=Isaac Castro - TodoConta
SENDY_FROM_EMAIL=[email protected]
SENDY_REPLY_TO=[email protected]

# Listas de Sendy (obtener IDs desde Sendy)
SENDY_LIST_PRINCIPAL=xxxxxxxxxxxxxxxxxxxxx
SENDY_LIST_PRO=xxxxxxxxxxxxxxxxxxxxx
SENDY_LIST_EMPRESARIOS=xxxxxxxxxxxxxxxxxxxxx

# Blog
BLOG_BASE_URL=https://columna13.club
```

#### `.github/workflows/sync.yml`
```yaml
name: Sync Newsletters

on:
  schedule:
    # Cada 15 minutos
    - cron: '*/15 * * * *'
  
  # Permitir ejecución manual
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run sync
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
          GITHUB_TOKEN: ${{ secrets.GH_PAT }}
          GITHUB_OWNER: ${{ secrets.GITHUB_OWNER }}
          GITHUB_REPO: ${{ secrets.GITHUB_REPO }}
          SENDY_API_URL: ${{ secrets.SENDY_API_URL }}
          SENDY_API_KEY: ${{ secrets.SENDY_API_KEY }}
          SENDY_BRAND_ID: ${{ secrets.SENDY_BRAND_ID }}
          SENDY_FROM_NAME: ${{ secrets.SENDY_FROM_NAME }}
          SENDY_FROM_EMAIL: ${{ secrets.SENDY_FROM_EMAIL }}
          SENDY_REPLY_TO: ${{ secrets.SENDY_REPLY_TO }}
          SENDY_LIST_PRINCIPAL: ${{ secrets.SENDY_LIST_PRINCIPAL }}
          SENDY_LIST_PRO: ${{ secrets.SENDY_LIST_PRO }}
          SENDY_LIST_EMPRESARIOS: ${{ secrets.SENDY_LIST_EMPRESARIOS }}
          BLOG_BASE_URL: ${{ secrets.BLOG_BASE_URL }}
        run: npm run sync
```

**Push a GitHub:**
```bash
git init
git add .
git commit -m "Initial sync service"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/newsletter-sync-service.git
git push -u origin main
```

---

### PASO 4: Configurar Secrets en GitHub

En el repo `newsletter-sync-service`:

1. Ve a Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Agrega cada variable del `.env`

**IMPORTANTE**: Para `GITHUB_TOKEN`, necesitas crear un Personal Access Token:
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Scopes: `repo` (todos)
4. Copia el token y guárdalo como `GH_PAT`

---

### PASO 5: Obtener IDs de Listas de Sendy

1. Entra a tu instalación de Sendy
2. Ve a "View all lists"
3. Haz click en una lista
4. En la URL verás: `?i=xxx&l=yyy` → `yyy` es el List ID
5. Repite para cada lista

---

## 🧪 Testing

### Test Local (antes de GitHub Actions)
```bash
cd newsletter-sync-service
npm install

# Crear .env con tus valores reales
cp .env.example .env
# Editar .env con tus datos

# Ejecutar
npm run sync
```

### Test en Notion

1. Crea una página de prueba en tu database
2. Llena todos los campos
3. Marca ✅ "Listo para publicar"
4. Marca 📤 "Enviar ahora"
5. Ejecuta `npm run sync`
6. Verifica:
   - Archivo creado en GitHub
   - Email enviado en Sendy
   - Notion actualizado con URL y status "Sent"

---

## 🚀 Deploy y Uso Diario

### Workflow Diario

1. **En Notion (móvil o desktop)**:
   - Crear nueva página en database
   - Escribir contenido (300-400 palabras)
   - Llenar Subject
   - Seleccionar Lista
   - Marcar ✅ Listo para publicar
   - Marcar 📤 Enviar ahora

2. **Automático (en 15 min máximo)**:
   - GitHub Action se ejecuta
   - Crea post en blog
   - Envía newsletter
   - Actualiza Notion

3. **Resultado**:
   - Newsletter enviado ✅
   - Post publicado en blog ✅
   - URL en Notion ✅

### Envío Manual (urgente)

Si no quieres esperar 15 min:

1. Ve al repo `newsletter-sync-service` en GitHub
2. Actions → Sync Newsletters
3. Click "Run workflow"
4. Espera ~30 segundos

---

## 🐛 Troubleshooting

### Newsletter no se envía

**Verificar:**
1. ¿Los 2 checkboxes están marcados?
2. ¿Status != "Sent"?
3. ¿Lista existe en SENDY_LISTS?
4. ¿API key de Sendy correcta?

**Revisar logs:**
- GitHub Actions → Click en el workflow → Ver logs

### Archivo no aparece en blog

**Verificar:**
1. ¿Se creó el commit en GitHub?
2. ¿Vercel/Netlify hizo rebuild?
3. ¿El frontmatter está correcto?

**Rebuild manual:**
- Vercel: Deployments → Redeploy
- Netlify: Deploys → Trigger deploy

### Error en Notion

**Si status = "Error":**
1. Ver logs en GitHub Actions
2. Verificar que todos los campos estén llenos
3. Re-marcar checkboxes y probar de nuevo

---

## 📊 Monitoreo

### GitHub Actions
- Ve a Actions en el repo
- Verás cada ejecución (cada 15 min)
- Click para ver logs detallados

### Sendy
- Dashboard → Campaigns
- Verás cada newsletter enviada

### Blog
- Visita `https://tu-dominio.com/newsletter`
- Verás lista completa de posts

---

## 🔒 Seguridad

- ✅ Nunca commitear `.env`
- ✅ Usar GitHub Secrets
- ✅ Tokens con permisos mínimos necesarios
- ✅ Notion integration solo con acceso a esa database

---

## 📈 Mejoras Futuras

Después de que funcione, puedes agregar:

1. **Programación de envíos**
   - Usar campo "Fecha Publicación" para envío futuro
   - Modificar filtro en Notion query

2. **Categorías/Tags**
   - Agregar property "Categoría" en Notion
   - Agrupar por categoría en blog

3. **Analytics**
   - Agregar tracking a URLs del blog
   - Ver qué newsletters tienen más clicks

4. **Imágenes**
   - Soportar imágenes en contenido
   - Subirlas a Cloudinary/S3

---

## ✅ Checklist de Implementación

- [ ] Base de datos creada en Notion
- [ ] Integración de Notion creada y conectada
- [ ] Repo blog Astro creado y desplegado
- [ ] Repo sync service creado
- [ ] Secrets configurados en GitHub
- [ ] IDs de listas de Sendy obtenidos
- [ ] Test local exitoso
- [ ] Test end-to-end exitoso
- [ ] GitHub Action habilitado
- [ ] Primera newsletter enviada 🎉

---

## 🆘 Soporte

Si algo no funciona:
1. Revisa los logs de GitHub Actions
2. Verifica que todos los secrets estén configurados
3. Prueba localmente con `npm run sync`
4. Revisa que Sendy API esté respondiendo

---

**¡Listo para automatizar tu newsletter!** 🚀

El flujo quedará así:
- Escribes en Notion desde el móvil (2-3 min)
- Marcas 2 checkboxes
- En máximo 15 min: Newsletter enviada + Post publicado
- Cero código, cero interfaz web de Sendy