import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const examplesDir = join(__dirname, '../examples');

// Get all directories in examples folder
const examples = readdirSync(examplesDir)
  .filter(file => statSync(join(examplesDir, file)).isDirectory());

// Process each example's package.json
examples.forEach(example => {
  const packagePath = join(examplesDir, example, 'package.json');
  
  if (existsSync(packagePath)) {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    
    if (packageJson.dependencies && packageJson.dependencies['@solidjs/start']) {
      packageJson.dependencies['@solidjs/start'] = 'workspace:*';
      
      writeFileSync(
        packagePath, 
        JSON.stringify(packageJson, null, 2) + '\n',
        'utf8'
      );
      
      console.log(`Updated ${packagePath}`);
    }
  }
});

