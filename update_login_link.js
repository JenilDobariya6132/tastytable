const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    const relativePath = path.relative(rootDir, filePath);
    const isInSubDir = relativePath.includes(path.sep);
    const prefix = isInSubDir ? '../' : '';

    // Replace href="#" with href="login.html" (with correct prefix) for the Login dropdown toggle
    // <a class="dropdown-toggle" href="#">Login</a>
    const regex = /<a\s+class="dropdown-toggle"\s+href="#">\s*Login\s*<\/a>/gi;
    const replacement = `<a class="dropdown-toggle" href="${prefix}login.html">Login</a>`;

    if (regex.test(content)) {
        content = content.replace(regex, replacement);
        console.log(`Updated: ${filePath}`);
    }

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

function traverseDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                traverseDir(fullPath);
            }
        } else if (file.endsWith('.html')) {
            processFile(fullPath);
        }
    }
}

traverseDir(rootDir);
