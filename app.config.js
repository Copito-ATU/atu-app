const fs = require('fs');
const path = require('path');

function parseDotEnv(filePath) {
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  return content.split(/\r?\n/).reduce((acc, line) => {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || line.trim().startsWith('#')) return acc;
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    acc[key] = value;
    return acc;
  }, {});
}

const env = parseDotEnv(path.resolve(__dirname, '.env'));

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    ...env,
  },
});
