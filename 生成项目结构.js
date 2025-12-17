import { readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function generateTree(dir, prefix = '') {
    const files = readdirSync(dir);
    let result = '';

    files.forEach((file, index) => {
        const fullPath = join(dir, file);
        const isLast = index === files.length - 1;
        const stat = statSync(fullPath);

        // 跳过不需要的文件夹
        if (['node_modules', '.git', 'dist', 'build', "生成项目结构.js"].includes(file)) {
            return;
        }

        result += prefix + (isLast ? '└── ' : '├── ') + file + '\n';

        if (stat.isDirectory()) {
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            result += generateTree(fullPath, newPrefix);
        }
    });

    return result;
}

const structure = generateTree(__dirname);
writeFileSync('project-structure.txt', structure);
console.log('✅ 项目结构已生成到 project-structure.txt');