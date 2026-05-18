const http = require('http');

function req(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(safeJSON(data)));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function safeJSON(str) {
    try { return JSON.parse(str); } catch (e) { return str; }
}

async function run() {
    try {
        console.log('Testing Rating...');
        // Rate recipe 1 with 5 stars by user 1
        let r1 = await req('POST', '/recipes/1/rate', { user_id: 1, rating: 5 });
        console.log('Rate 1:', r1);
        
        // Rate recipe 1 with 4 stars by user 2
        let r2 = await req('POST', '/recipes/1/rate', { user_id: 2, rating: 4 });
        console.log('Rate 2:', r2);
        
        // Get rating
        let r3 = await req('GET', '/recipes/1/rating?user_id=1');
        console.log('Get Rating:', r3);

        console.log('Testing Promote...');
        // Promote recipe 1 by user 1 (assuming user 1 is author, might fail if not)
        // First check author of recipe 1. If static or unknown, this might fail.
        // Let's assume recipe 1 exists and has an author. If not, we might need to create one.
        
        // Create a recipe first to be sure
        let c1 = await req('POST', '/recipes/create', { name: 'Test Recipe', author_id: 1, author: 'User1' });
        console.log('Created:', c1);
        if (c1.ok) {
            const id = c1.id;
            
            // Promote (Active)
            let p1 = await req('POST', '/recipes/' + id + '/promote', { user_id: 1, status: 'active' });
            console.log('Promote Active:', p1);
            
            // Check status via /recipes/my
            let my1 = await req('GET', '/recipes/my?author_id=1');
            const rec = my1.recipes.find(r => r.id === id);
            console.log('My List Status (should be active):', rec ? rec.promotion_status : 'Not Found');
            
            // Depromote (Paused)
            let p2 = await req('POST', '/recipes/' + id + '/promote', { user_id: 1, status: 'paused' });
            console.log('Promote Paused:', p2);
            
            // Check status
            let my2 = await req('GET', '/recipes/my?author_id=1');
            const rec2 = my2.recipes.find(r => r.id === id);
            console.log('My List Status (should be paused):', rec2 ? rec2.promotion_status : 'Not Found');
        }
        
    } catch (e) {
        console.error(e);
    }
}

run();