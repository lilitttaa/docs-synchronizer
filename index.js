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

async function generateMetaInfo(mdFileName, mdDir) {
    const mdFilePath = path.join(mdDir, mdFileName);
    const mdContent = await fs.readFile(mdFilePath, "utf-8");
    const meta = {};
    const lines = mdContent.split("\n");
    let bPushed = false;
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (index == 0 && !line.startsWith('---'))
            break;
        if (line.startsWith("---")) {
            bPushed = !bPushed;
            continue;
        }
        if (bPushed) {
            if (line.trim() === "" || !line.includes(":")) {
                continue;
            }
            const arr = line.split(":");
            meta[arr[0].trim()] = arr[1].trim();
        }
    }
    const stat = await fs.stat(mdFilePath);
    meta["created_at"] = stat.birthtime;
    console.log("Meta: ", meta);
    return meta;
}

async function uploadMd2Blog(mdDir, mdFileName, dirCollections) {
    console.log("dirCollections",dirCollections)
    const htmlFilePath = path.join(dirCollections.cachedDirPath, mdFileName.replace(".md", ".html"));
    const fileNameWithoutExt = mdFileName.replace(".md", "");
    const blogOutputFilePath = path.join(dirCollections.blogPostsDirPath, mdFileName.replace(".md", ".html"));
    const blogImageDirPath = path.join(dirCollections.blogImagesDirPath, fileNameWithoutExt);

    await fs.mkdir(dirCollections.cachedDirPath, { recursive: true });
    await copyMdToLocalCacheDir(mdDir, mdFileName, dirCollections.cachedDirPath);
    await exportHtmlFromMarkdown(dirCollections.cachedDirPath, mdFileName);
    await remapHtmlFileImgUrls(htmlFilePath, fileNameWithoutExt);
    await fs.copyFile(htmlFilePath, blogOutputFilePath);
    await createACleanDir(blogImageDirPath);
    await copyFiles(mdDir, blogImageDirPath);
    await fs.rmdir(dirCollections.cachedDirPath, { recursive: true });
}

async function uploadBlog(blogRootDirPath) {
    console.log("Uploading blog...")
    const git = require('simple-git')(blogRootDirPath);
    await git.add(".");
    await git.commit("Update blog");
    await git.push("origin", "master");
}

async function pullBlog(blogRootDirPath) {
    console.log("Pulling blog...")
    const git = require('simple-git')(blogRootDirPath);
    await git.pull("origin", "master");
}

async function copyFiles(sourceDir, targetDir, extChecker) {
    const files = await fs.readdir(sourceDir);
    for (const file of files) {
        if (extChecker(file)) {
            await fs.copyFile(path.join(sourceDir, file), path.join(targetDir, file));
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

async function exportMetaInfoFile(metas, filePath) {
    await fs.writeFile(filePath, JSON.stringify(metas, null, 2));
}

const imgExtChecker = (file) =>{
	return file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg") || file.endsWith(".gif") || file.endsWith(".svg")
}

async function main() {
    const config = require('./config.json');
    const mdRootDirPath = config.mdRootDirPath;
    const blogRootDirPath = config.blogRootDirPath;

    const dirCollections = {
        currentDirPath: process.cwd(),
        mdRootDirPath: config.mdRootDirPath,
        blogRootDirPath: config.blogRootDirPath,
        cachedDirPath: path.join(process.cwd(), "cache"),
        rootCoverDirPath: path.join(config.mdRootDirPath,"BlogSync","Covers"),
        blogPostsDirPath: path.join(config.blogRootDirPath, "posts"),
        blogImagesDirPath: path.join(config.blogRootDirPath, "public", "images"),
        blogCoversImagesDirPath: path.join(config.blogRootDirPath, "public", "images","covers"),
    }

    await pullBlog(blogRootDirPath);

    const pubMdFiles = getAllPubMdFiles(await fs.readdir(mdRootDirPath, { recursive: true }));
    let metas = {}
    for (const mdFile of pubMdFiles) {
        console.log("Processing: ", mdFile.fileName);
        const mdDir = path.join(mdRootDirPath, mdFile.dir);
        await uploadMd2Blog(mdDir, mdFile.fileName, dirCollections);
        const meta = await generateMetaInfo(mdFile.fileName, mdDir);
        metas[mdFile.fileName.replace(".md", "")] = meta;
    }
	await createACleanDir(dirCollections.blogCoversImagesDirPath);
	await copyFiles(dirCollections.rootCoverDirPath, dirCollections.blogCoversImagesDirPath, imgExtChecker);
	
    await exportMetaInfoFile(metas, path.join(dirCollections.blogPostsDirPath, "meta.json"));
    await uploadBlog(blogRootDirPath);
}

main();


