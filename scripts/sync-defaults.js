const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'options', 'options.json');
const shared = path.join(__dirname, '..', 'src', 'shared', 'web-purge-defaults.json');
const docs = path.join(__dirname, '..', 'docs', 'web-purge-defaults.json');

try {
    const raw = fs.readFileSync(src, 'utf8');
    const opts = JSON.parse(raw);
    const out = {
        defaultsVersion: opts.version || opts.defaultsVersion || '1.0.0',
        categories: opts.categories || []
    };
    fs.writeFileSync(shared, JSON.stringify(out, null, 2), 'utf8');
    fs.writeFileSync(docs, JSON.stringify(out, null, 2), 'utf8');
    console.log('Synced defaults to', shared, 'and', docs);
} catch (e) {
    console.error('Failed to sync defaults:', e);
    process.exit(1);
}
