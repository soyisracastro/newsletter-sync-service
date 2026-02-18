import { Client } from '@notionhq/client';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';
import { format } from 'date-fns';

// ============================================
// CONFIGURACIÓN
// ============================================

const CONFIG = {
  notion: {
    token: process.env.NOTION_TOKEN,
    databaseId: process.env.NOTION_DATABASE_ID,
  },
  github: {
    token: process.env.GH_PAT,
    owner: process.env.GH_OWNER,
    repo: process.env.GH_REPO,
    branch: 'main',
  },
  sendy: {
    apiUrl: process.env.SENDY_API_URL,
    apiKey: process.env.SENDY_API_KEY,
    brandId: process.env.SENDY_BRAND_ID || '1',
    fromName: process.env.SENDY_FROM_NAME || 'Israel Castro',
    fromEmail: process.env.SENDY_FROM_EMAIL || '[email protected]',
    replyTo: process.env.SENDY_REPLY_TO || '[email protected]',
  },
  blog: {
    baseUrl: process.env.BLOG_BASE_URL || 'https://columna13.club',
  },
};

const SENDY_LISTS = {
  'Principal': process.env.SENDY_LIST_PRINCIPAL,
  'Test': process.env.SENDY_LIST_TEST,
};

// ============================================
// CLIENTES
// ============================================

const notion = new Client({ auth: CONFIG.notion.token });
const octokit = new Octokit({ auth: CONFIG.github.token });

// ============================================
// NOTION: LEER BLOQUES DE PÁGINA
// ============================================

/**
 * Extrae texto plano de un array de rich_text de Notion
 */
function richTextToPlain(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) return '';
  return richTextArray.map(rt => rt.plain_text).join('');
}

/**
 * Convierte rich_text de Notion a Markdown con formato
 */
function richTextToMarkdown(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) return '';
  return richTextArray.map(rt => {
    let text = rt.plain_text;
    if (rt.annotations?.bold) text = `**${text}**`;
    if (rt.annotations?.italic) text = `*${text}*`;
    if (rt.annotations?.strikethrough) text = `~~${text}~~`;
    if (rt.annotations?.code) text = `\`${text}\``;
    if (rt.href) text = `[${text}](${rt.href})`;
    return text;
  }).join('');
}

/**
 * Convierte rich_text de Notion a HTML con formato
 */
function richTextToHtml(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) return '';
  return richTextArray.map(rt => {
    let text = rt.plain_text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (rt.annotations?.bold) text = `<strong>${text}</strong>`;
    if (rt.annotations?.italic) text = `<em>${text}</em>`;
    if (rt.annotations?.strikethrough) text = `<s>${text}</s>`;
    if (rt.annotations?.code) text = `<code>${text}</code>`;
    if (rt.href) text = `<a href="${rt.href}" style="color: #3b82f6;">${text}</a>`;
    return text;
  }).join('');
}

/**
 * Lee todos los bloques hijos de una página de Notion (con paginación)
 */
async function getPageBlocks(pageId) {
  const blocks = [];
  let cursor;

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

/**
 * Convierte bloques de Notion a Markdown
 */
function blocksToMarkdown(blocks) {
  const lines = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
        lines.push(richTextToMarkdown(block.paragraph.rich_text));
        lines.push('');
        break;

      case 'heading_1':
        lines.push(`## ${richTextToMarkdown(block.heading_1.rich_text)}`);
        lines.push('');
        break;

      case 'heading_2':
        lines.push(`### ${richTextToMarkdown(block.heading_2.rich_text)}`);
        lines.push('');
        break;

      case 'heading_3':
        lines.push(`#### ${richTextToMarkdown(block.heading_3.rich_text)}`);
        lines.push('');
        break;

      case 'bulleted_list_item':
        lines.push(`- ${richTextToMarkdown(block.bulleted_list_item.rich_text)}`);
        break;

      case 'numbered_list_item':
        lines.push(`1. ${richTextToMarkdown(block.numbered_list_item.rich_text)}`);
        break;

      case 'quote':
        lines.push(`> ${richTextToMarkdown(block.quote.rich_text)}`);
        lines.push('');
        break;

      case 'divider':
        lines.push('---');
        lines.push('');
        break;

      case 'callout':
        lines.push(`> ${richTextToMarkdown(block.callout.rich_text)}`);
        lines.push('');
        break;

      case 'toggle':
        lines.push(`**${richTextToMarkdown(block.toggle.rich_text)}**`);
        lines.push('');
        break;

      case 'image': {
        const url = block.image.type === 'external'
          ? block.image.external.url
          : block.image.file.url;
        const caption = richTextToPlain(block.image.caption);
        lines.push(`![${caption}](${url})`);
        lines.push('');
        break;
      }

      default:
        // Ignorar bloques no soportados
        break;
    }
  }

  return lines.join('\n').trim();
}

/**
 * Convierte bloques de Notion a HTML para email
 */
function blocksToHtml(blocks) {
  const parts = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph': {
        const text = richTextToHtml(block.paragraph.rich_text);
        if (text) {
          parts.push(`<p style="line-height: 1.6; margin-bottom: 16px;">${text}</p>`);
        }
        break;
      }

      case 'heading_1':
        parts.push(`<h2 style="font-size: 24px; font-weight: bold; margin: 24px 0 12px;">${richTextToHtml(block.heading_1.rich_text)}</h2>`);
        break;

      case 'heading_2':
        parts.push(`<h3 style="font-size: 20px; font-weight: bold; margin: 20px 0 10px;">${richTextToHtml(block.heading_2.rich_text)}</h3>`);
        break;

      case 'heading_3':
        parts.push(`<h4 style="font-size: 18px; font-weight: bold; margin: 16px 0 8px;">${richTextToHtml(block.heading_3.rich_text)}</h4>`);
        break;

      case 'bulleted_list_item':
        parts.push(`<li style="line-height: 1.6; margin-bottom: 4px;">${richTextToHtml(block.bulleted_list_item.rich_text)}</li>`);
        break;

      case 'numbered_list_item':
        parts.push(`<li style="line-height: 1.6; margin-bottom: 4px;">${richTextToHtml(block.numbered_list_item.rich_text)}</li>`);
        break;

      case 'quote':
        parts.push(`<blockquote style="border-left: 3px solid #3b82f6; padding-left: 16px; margin: 16px 0; color: #555;">${richTextToHtml(block.quote.rich_text)}</blockquote>`);
        break;

      case 'divider':
        parts.push('<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">');
        break;

      case 'callout':
        parts.push(`<div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin: 16px 0;">${richTextToHtml(block.callout.rich_text)}</div>`);
        break;

      case 'image': {
        const url = block.image.type === 'external'
          ? block.image.external.url
          : block.image.file.url;
        const caption = richTextToPlain(block.image.caption);
        parts.push(`<img src="${url}" alt="${caption}" style="max-width: 100%; height: auto; border-radius: 6px; margin: 16px 0;">`);
        break;
      }

      default:
        break;
    }
  }

  // Envolver listas en <ul>/<ol>
  let html = parts.join('\n');
  html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
    return `<ul style="padding-left: 20px; margin-bottom: 16px;">\n${match}</ul>\n`;
  });

  return html;
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

/**
 * Genera slug a partir del título y fecha
 */
function generateSlug(title, date) {
  const fechaFormato = format(new Date(date), 'yyyy-MM-dd');
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return `${fechaFormato}-${slug}`;
}

/**
 * Trunca texto en el límite de palabra más cercano
 */
function truncateAtWord(text, maxLength) {
  if (text.length <= maxLength) return text;
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

/**
 * Crea el HTML completo del email
 */
function createEmailHtml(bodyHtml, titulo) {
  return `<html>
<head>
<title>${titulo}</title>
</head>
<body style="max-width: 600px;">
${bodyHtml}

<p>&nbsp;</p>

<p><span style="font-size:12px;">Si deseas darte de baja, </span><unsubscribe><span style="font-size:12px;">clic aqu&iacute;</span></unsubscribe><span style="font-size:12px;">.</span></p>
</body>
</html>`;
}

/**
 * Crea archivo Markdown con frontmatter para Astro
 */
function createMarkdownFile(data) {
  const { titulo, markdownContent, descripcion, fecha, lista } = data;

  const safeTitulo = titulo.replace(/"/g, "'");
  const safeDescripcion = descripcion.replace(/"/g, "'");

  const frontmatter = [
    '---',
    `title: "${safeTitulo}"`,
    `pubDate: ${new Date(fecha).toISOString()}`,
    `description: "${safeDescripcion}"`,
    `sentToList: "${lista}"`,
    '---',
  ];

  return frontmatter.join('\n') + '\n\n' + markdownContent + '\n';
}

// ============================================
// GITHUB
// ============================================

/**
 * Crea o actualiza un archivo en GitHub vía API
 */
async function commitToGithub(filePath, content, message) {
  try {
    let sha;
    try {
      const { data } = await octokit.repos.getContent({
        owner: CONFIG.github.owner,
        repo: CONFIG.github.repo,
        path: filePath,
        ref: CONFIG.github.branch,
      });
      sha = data.sha;
    } catch {
      // Archivo no existe — es nuevo
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: CONFIG.github.owner,
      repo: CONFIG.github.repo,
      path: filePath,
      message,
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

// ============================================
// SENDY
// ============================================

/**
 * Envía una campaña a Sendy
 */
async function sendToSendy(data) {
  const { subject, htmlContent, listaId } = data;

  const formData = new URLSearchParams({
    api_key: CONFIG.sendy.apiKey,
    from_name: CONFIG.sendy.fromName,
    from_email: CONFIG.sendy.fromEmail,
    reply_to: CONFIG.sendy.replyTo,
    subject,
    html_text: htmlContent,
    list_ids: listaId,
    send_campaign: '1',
    brand_id: CONFIG.sendy.brandId,
  });

  try {
    const response = await fetch(`${CONFIG.sendy.apiUrl}/api/campaigns/create.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    const result = await response.text();

    if (result.includes('Campaign created') || !isNaN(result)) {
      return { success: true, campaignId: result };
    }
    return { success: false, error: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================
// NOTION: ACTUALIZAR
// ============================================

/**
 * Actualiza propiedades de una página de Notion
 */
async function updateNotionPage(pageId, updates) {
  try {
    const properties = {};

    if (updates.status) {
      properties['Status'] = { select: { name: updates.status } };
    }
    if (updates.hasOwnProperty('enviarAhora')) {
      properties['Enviar ahora'] = { checkbox: updates.enviarAhora };
    }
    if (updates.urlBlog) {
      properties['URL Blog'] = { url: updates.urlBlog };
    }
    if (updates.fechaEnvio) {
      properties['Fecha Envío'] = { date: { start: updates.fechaEnvio } };
    }

    await notion.pages.update({ page_id: pageId, properties });
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
    // 1. Query a Notion: buscar newsletters listas para enviar
    const response = await notion.databases.query({
      database_id: CONFIG.notion.databaseId,
      filter: {
        and: [
          { property: 'Listo para publicar', checkbox: { equals: true } },
          { property: 'Enviar ahora', checkbox: { equals: true } },
          // Si ya tiene "Fecha Envío", no se re-envía nunca
          { property: 'Fecha Envío', date: { is_empty: true } },
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
        // Extraer propiedades
        const props = page.properties;
        const titulo = props['Título']?.title?.[0]?.plain_text || 'Sin título';
        const listas = props['Lista Sendy']?.multi_select?.map(s => s.name) || ['Principal'];
        const fecha = new Date().toISOString();

        // Validar listas
        for (const lista of listas) {
          if (!SENDY_LISTS[lista]) {
            throw new Error(`Lista "${lista}" no configurada en SENDY_LISTS`);
          }
        }

        const listaIds = listas.map(l => SENDY_LISTS[l]).join(',');

        console.log(`📄 Procesando: "${titulo}"`);
        console.log(`   Listas: ${listas.join(', ')}`);
        console.log(`   Fecha: ${fecha}`);

        // 3. Leer contenido de los bloques de la página
        console.log('   → Leyendo contenido de Notion...');
        const blocks = await getPageBlocks(pageId);
        const markdownContent = blocksToMarkdown(blocks);
        const htmlContent = blocksToHtml(blocks);

        if (!markdownContent.trim()) {
          throw new Error('El contenido de la página está vacío');
        }

        // Generar slug y descripción
        const slug = generateSlug(titulo, fecha);
        const plainText = richTextToPlain(
          blocks
            .filter(b => b.type === 'paragraph')
            .flatMap(b => b.paragraph.rich_text)
        );
        const descripcion = truncateAtWord(plainText, 160);

        // 4. Enviar a Sendy PRIMERO (si falla, no queda post huérfano)
        console.log('   → Enviando newsletter vía Sendy...');
        const emailHtml = createEmailHtml(htmlContent, titulo);
        const sendyResult = await sendToSendy({
          subject: titulo,
          htmlContent: emailHtml,
          listaId: listaIds,
        });

        if (!sendyResult.success) {
          throw new Error(`Sendy error: ${sendyResult.error}`);
        }
        console.log('   ✅ Newsletter enviada');

        // 5. Crear archivo .md en GitHub
        console.log('   → Creando archivo en GitHub...');
        const filePath = `src/content/newsletters/${slug}.md`;
        const mdFile = createMarkdownFile({
          titulo,
          markdownContent,
          descripcion,
          fecha,
          lista: listas.join(', '),
        });

        const githubSuccess = await commitToGithub(filePath, mdFile, `Newsletter: ${titulo}`);
        if (!githubSuccess) {
          throw new Error('Error al crear archivo en GitHub');
        }
        console.log('   ✅ Archivo creado en GitHub');

        // 6. Actualizar Notion
        console.log('   → Actualizando Notion...');
        const urlBlog = `${CONFIG.blog.baseUrl}/${slug}`;
        await updateNotionPage(pageId, {
          status: 'Sent',
          enviarAhora: false,
          urlBlog,
          fechaEnvio: new Date().toISOString(),
        });
        console.log('   ✅ Notion actualizado');
        console.log(`   🔗 URL: ${urlBlog}\n`);

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);
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
