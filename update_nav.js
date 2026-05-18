const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Remove Admin link
    // Matches <a href="...">Admin</a> with optional whitespace
    content = content.replace(/<a\s+href="[^"]*admin\.html"[^>]*>\s*Admin\s*<\/a>\s*/gi, '');

    // Remove User link
    content = content.replace(/<a\s+href="[^"]*user\.html"[^>]*>\s*User\s*<\/a>\s*/gi, '');

    // Remove Categories dropdown
    // Matches <div class="dropdown">...Categories...</div>
    // We assume the structure is: <div class="dropdown">\s*<a ...>Categories</a>...</div>
    // We need to be careful not to match too much. 
    // Since the dropdown usually contains "Categories" text in the toggle.
    
    // Regex strategy: Look for the specific Categories dropdown structure.
    const categoriesRegex = /<div\s+class="dropdown">\s*<a\s+class="dropdown-toggle"\s+href="#">\s*Categories\s*<\/a>[\s\S]*?<\/div>\s*/gi;
    
    if (categoriesRegex.test(content)) {
        content = content.replace(categoriesRegex, '');
    } else {
        // Fallback for potentially different formatting or if it's inline
        // Try to match specific to the file content we've seen
        // <div class="dropdown"><a class="dropdown-toggle" href="#">Categories</a><div class="dropdown-list">...</div></div>
    }

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
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
