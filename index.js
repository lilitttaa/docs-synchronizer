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
    return meta;
}

async function uploadMd2Blog(mdDir, mdFileName, dirCollections) {
    const mdFilePath = path.join(dirCollections.cachedDirPath, mdFileName);
    const fileNameWithoutExt = mdFileName.replace(".md", "");
    const blogOutputFilePath = path.join(dirCollections.blogPostsDirPath, mdFileName);
    const blogImageDirPath = path.join(dirCollections.blogImagesDirPath, fileNameWithoutExt);

    await fs.mkdir(dirCollections.cachedDirPath, { recursive: true });
    await copyMdToLocalCacheDir(mdDir, mdFileName, dirCollections.cachedDirPath);
    // await exportHtmlFromMarkdown(dirCollections.cachedDirPath, mdFileName);
    // await remapHtmlFileImgUrls(mdFilePath, fileNameWithoutExt);
    await fs.copyFile(mdFilePath, blogOutputFilePath);
    await createACleanDir(blogImageDirPath);
    await copyFiles(mdDir, blogImageDirPath,imgExtChecker);
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

const jsonExtChecker = (file)=>{
	return file.endsWith("json")
}

async function readCollectionInfo(filePath){
	const content = await fs.readFile(filePath, "utf-8");
	return JSON.parse(content);
}

const checkFileInCollections = (fileName, collectionInfo) => {
	console.log('collectionInfo',collectionInfo)
	for(const key in collectionInfo){
		const collection = collectionInfo[key]
		console.log('collection',collection)
		for(const collectionFileName of collection.List){
			console.log('collectionFileName',collectionFileName)
			if(fileName === collectionFileName){
				console.log('checkFileInCollections',fileName,collectionFileName,collection.Name)
				return true;
			}
		}
	}
	return false;
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
        blogSyncDirPath: path.join(config.mdRootDirPath,"BlogSync"),
        blogPostsDirPath: path.join(config.blogRootDirPath, "posts"),
        blogImagesDirPath: path.join(config.blogRootDirPath, "public", "images"),
        blogCoversImagesDirPath: path.join(config.blogRootDirPath, "public", "images","covers"),
    }

    await pullBlog(blogRootDirPath);

    const pubMdFiles = getAllPubMdFiles(await fs.readdir(mdRootDirPath, { recursive: true }));
    let metas = {}
	const collectionInfo = await readCollectionInfo(path.join(dirCollections.blogSyncDirPath,"Collections.json"))
    let fileNamesNotInCollections = []
	for (const mdFile of pubMdFiles) {
        console.log("Processing: ", mdFile.fileName);
        const mdDir = path.join(mdRootDirPath, mdFile.dir);
        await uploadMd2Blog(mdDir, mdFile.fileName, dirCollections);
        const meta = await generateMetaInfo(mdFile.fileName, mdDir);
        metas[mdFile.fileName.replace(".md", "")] = meta;
		if(!checkFileInCollections(mdFile.fileName.replace(".md",""),collectionInfo)){
			fileNamesNotInCollections.push(mdFile.fileName)
		}
    }
	for(const fileName of fileNamesNotInCollections){
		console.error('file not in any collection',fileName)
	}
	await createACleanDir(dirCollections.blogCoversImagesDirPath);
	await copyFiles(dirCollections.rootCoverDirPath, dirCollections.blogCoversImagesDirPath, imgExtChecker);
	await copyFiles(dirCollections.blogSyncDirPath,dirCollections.blogPostsDirPath,jsonExtChecker)
    await exportMetaInfoFile(metas, path.join(dirCollections.blogPostsDirPath, "meta.json"));
    await uploadBlog(blogRootDirPath);
}

main();


