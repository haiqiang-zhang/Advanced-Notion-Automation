const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
var db_name = 'server.db'


function initDB() {
    return new Promise( (resolve, reject) => {
        if (!fs.existsSync(db_name)) {
            let db = new sqlite3.Database(db_name)
            db.serialize(() => {
                db.run(`CREATE TABLE sync_task (id INTEGER PRIMARY KEY,
                    db1_id Text,
                    db2_id Text,
                    db1_filter Text,
                    db2_filter Text
                );`)

                const init_db1_filter = JSON.stringify({
                    and:[
                        {
                            property: "Type",
                            multi_select: {contains: "YouTutor",}
            
                        }
                    ]
                });

                const init_db2_filter = JSON.stringify({
                    and:[
                        {
                            property: "Type",
                            multi_select: {contains: "YT课程安排",}
                        }
                    ]
                });

                db.run(`INSERT INTO sync_task 
                    VALUES (1, '9ab8d4ccac0540a5b317bd6e8c320381', '82773be887a24e0abd9a130aa7793481', '${init_db1_filter}', '${init_db2_filter}')`);
                console.log('Database created');
            })
            db.close(()=>{
                console.log('Successfully connected to database');
                resolve();
            })
        }
        console.log('Successfully connected to database');
        resolve();
    })
}

function getTasks() {
    return new Promise(
        (resolve, reject) => {
            let db = new sqlite3.Database(db_name)
            var tasks = []
            db.serialize(() => {
                db.each('SELECT * FROM sync_task', (err, row) => {
                    tasks.push(row);
                })
            })
            db.close((err)=>{
                if (err) {
                    reject(err);
                } else {
                    resolve(tasks);
                }
                
            })
        }
    )
} 


module.exports = {
    initDB,
    getTasks
}


