

// CJS
const { Notebook } = require('crossnote');
const fs = require('fs').promises;
const path = require('path');
// ESM
// import { Notebook } from "crossnote"

async function exportHtmlFromMarkdown(dirPath, fileName) {
    const notebook = await Notebook.init({
        notebookPath: dirPath,
        config: {
            previewTheme: 'github-light.css',
            mathRenderingOption: 'KaTeX',
            codeBlockTheme: 'github.css',
            printBackground: true,
            enableScriptExecution: true, // <= For running code chunks.
        },
    });

    // Get the markdown engine for a specific note file in your notebook.
    const engine = notebook.getNoteMarkdownEngine(fileName);

    // html export
    await engine.htmlExport({ offline: false, runAllCodeChunks: true });
}

async function uploadMd2Blog(mdDir, mdFileName, blogRootDir) {
    const currentDir = process.cwd();
    const cacheDir = path.join(currentDir, "cache");

    // Create the cache directory.
    await fs.mkdir(cacheDir, { recursive: true });

    // Copy md to local cache dir
    const mdFilePath = path.join(mdDir, mdFileName);
    const cacheMdFilePath = path.join(cacheDir, mdFileName);
    await fs.copyFile(mdFilePath, cacheMdFilePath);

    // export Html from markdown
    await exportHtmlFromMarkdown(cacheDir, mdFileName);

    // Add '/images/' prefix to all image url in the html.
    const htmlFilePath = path.join(cacheDir, mdFileName.replace(".md", ".html"));
    let html = await fs.readFile(htmlFilePath, "utf-8");

    const mdFileNameWithoutExt = mdFileName.replace(".md", "");
    html = html.replace(/<img src="(?<url>[^"]+)"/g, `<img src="/images/${mdFileNameWithoutExt}/$<url>"`);
    await fs.writeFile(htmlFilePath, html);

    // Move the exported html file to the blog directory.
    const blogHtmlFilePath = path.join(blogRootDir, 'posts', mdFileName.replace(".md", ".html"));
    await fs.copyFile(htmlFilePath, blogHtmlFilePath);

    // Move all images to the blog directory.
    const blogImageDir = path.join(blogRootDir, "public", "images", mdFileNameWithoutExt);
    await fs.mkdir(blogImageDir, { recursive: true });

    // Clear the blogImageDir
    await fs.rmdir(blogImageDir, { recursive: true });
    await fs.mkdir(blogImageDir, { recursive: true });

    const files = await fs.readdir(mdDir);
    for (const file of files) {
        if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg") || file.endsWith(".gif") || file.endsWith(".svg")) {
            await fs.copyFile(path.join(mdDir, file), path.join(blogImageDir, file));
        }
    }

    // Clear the cache directory.
    await fs.rmdir(cacheDir, { recursive: true });

    // Git commit and push the blog directory.
    const git = require('simple-git')(blogRootDir);
    await git.add(".");
    await git.commit("Update blog");
    await git.push("origin", "master");
}



async function main() {
    const config = require('./config.json');
    const mdRootDirPath = config.mdRootDirPath;
    const blogRootDirPath = config.blogRootDirPath;

    const files = await fs.readdir(mdRootDirPath, { recursive: true });
    const mdFiles = [];
    for (const file of files) {
        const fileName = path.basename(file);
        console.log(file);
        if (fileName.startsWith("Pub_") && fileName.endsWith(".md")) {
            mdFiles.push({
                dir: path.dirname(file),
                fileName: fileName,
            });
        }
    }


    for (const mdFile of mdFiles) {
        const dirPath = path.join(mdRootDirPath, mdFile.dir);
        await uploadMd2Blog(dirPath, mdFile.fileName, blogRootDirPath);
    }

    return process.exit();
}

main();