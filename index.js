const { Notebook } = require('crossnote');
const fs = require('fs').promises;
const path = require('path');

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

    await notebook.getNoteMarkdownEngine(fileName).htmlExport({ offline: false, runAllCodeChunks: true });
}

async function uploadMd2Blog(mdDir, mdFileName, blogRootDir) {
    const currentDirPath = process.cwd();
    const cacheDirPath = path.join(currentDirPath, "cache");
    const htmlFilePath = path.join(cacheDirPath, mdFileName.replace(".md", ".html"));
    const fileNameWithoutExt = mdFileName.replace(".md", "");
    const blogOutputFilePath = path.join(blogRootDir, 'posts', mdFileName.replace(".md", ".html"));
    const blogImageDirPath = path.join(blogRootDir, "public", "images", fileNameWithoutExt);

    await fs.mkdir(cacheDirPath, { recursive: true });
    await copyMdToLocalCacheDir(mdDir, mdFileName, cacheDirPath);
    await exportHtmlFromMarkdown(cacheDirPath, mdFileName);
    await remapHtmlFileImgUrls(htmlFilePath, fileNameWithoutExt);
    await fs.copyFile(htmlFilePath, blogOutputFilePath);
    await createACleanDir(blogImageDirPath);
    await copyImagesToBlog(mdDir, blogImageDirPath);
    await fs.rmdir(cacheDirPath, { recursive: true });
    
}

async function uploadBlog(blogRootDirPath) {
    console.log("Uploading blog...")
    const git = require('simple-git')(blogRootDirPath);
    await git.add(".");
    await git.commit("Update blog");
    await git.push("origin", "master");
}

async function copyImagesToBlog(mdDir, blogImageDirPath) {
    const files = await fs.readdir(mdDir);
    for (const file of files) {
        if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg") || file.endsWith(".gif") || file.endsWith(".svg")) {
            await fs.copyFile(path.join(mdDir, file), path.join(blogImageDirPath, file));
        }
    }
}

async function createACleanDir(blogImageDirPath) {
    await fs.mkdir(blogImageDirPath, { recursive: true });
    await fs.rmdir(blogImageDirPath, { recursive: true });
    await fs.mkdir(blogImageDirPath, { recursive: true });
}

async function remapHtmlFileImgUrls(htmlFilePath, fileNameWithoutExt) {
    let html = await fs.readFile(htmlFilePath, "utf-8");
    html = html.replace(/<img src="(?<url>[^"]+)"/g, `<img src="/images/${fileNameWithoutExt}/$<url>"`);
    await fs.writeFile(htmlFilePath, html);
}

async function copyMdToLocalCacheDir(mdDir, mdFileName, cacheDir) {
    const mdFilePath = path.join(mdDir, mdFileName);
    const cacheMdFilePath = path.join(cacheDir, mdFileName);
    await fs.copyFile(mdFilePath, cacheMdFilePath);
}

function getAllPubMdFiles(files) {
    let pubMdFiles = []
    for (const file of files) {
        const fileName = path.basename(file);
        if (fileName.startsWith("Pub_") && fileName.endsWith(".md")) {
            pubMdFiles.push({
                dir: path.dirname(file),
                fileName: fileName,
            });
        }
    }
    return pubMdFiles;
}

async function main() {
    const config = require('./config.json');
    const mdRootDirPath = config.mdRootDirPath;
    const blogRootDirPath = config.blogRootDirPath;

    const pubMdFiles = getAllPubMdFiles(await fs.readdir(mdRootDirPath, { recursive: true }));

    for (const mdFile of pubMdFiles) {
        console.log("Processing: ", mdFile.fileName);
        const dirPath = path.join(mdRootDirPath, mdFile.dir);
        await uploadMd2Blog(dirPath, mdFile.fileName, blogRootDirPath);
    }

    await uploadBlog(blogRootDirPath);
}

main();


