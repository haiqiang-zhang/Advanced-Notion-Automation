// import the required modules
require("dotenv").config()
const { Client } = require("@notionhq/client");
const express = require("express")
const {getTasks, initDB} = require("./server-db")

const notion = new Client({ auth: process.env.NOTION_KEY })
const app = express()
app.set('view engine', 'ejs');
let statusMapList = [];

app.use(express.static("public"))
app.use(express.json()) 


// app.get("/new_tasks", function (request, response) {
//     response.render(__dirname + "/views/new_tasks.ejs")
// })

// app.get("/", function (request, response) {
//     response.render(__dirname + "/views/tasks.ejs")
// })




// app.get("/api/retrieve_db/:dbid",  async (request, response) => {
//     const databaseId = request.params.dbid;
//     try {
//     const db = await notion.databases.retrieve({ database_id: databaseId });
//     response.json(db)
//     } catch (error) {
//         response.status(error.status).json({error: error.message})
//     }

// })

// app.post("/api/query_db/:dbid", async (request, response) => {
//     const databaseId = request.params.dbid;
//     const property_id = request.body.property_id;
//     const property_value = request.body.property_value;
//     const res = await notion.databases.query({
//       database_id: databaseId,
//       filter: {
//         and:[
//             {
//                 property: property_id,
//                 multi_select: {contains: property_value,}

//             }
//         ]
//       },
//     });
//     response.json(res);
//   });

async function queryDatabase(databaseId, filter_json) {
    const res = await notion.databases.query({
      database_id: databaseId,
      filter: filter_json,
    });
    return res;
}


async function getStausIdMap(db1_id, db2_id){
  const db1 = await notion.databases.retrieve({ database_id: db1_id });
  const db2 = await notion.databases.retrieve({ database_id: db2_id });

  const db1_status = db1.properties["Status"].status.options;
  const db2_status = db2.properties["Status"].status.options;

  const statusMap = {};
  for (const s of db1_status) {
    const db2_s = db2_status.find((x) => x.name === s.name);
    statusMap[s.name] = {db1: s.id, db2: db2_s.id};
  }
  return statusMap;
}

function nameCleaner(name) {
  // [COMPSCI 230] Lab 11 -> Lab 11 (substring the first ] and trim)
  // do not clean the name like "Lab 11 [Recording]" ([] is not at the beginning)
  let name_trimed = name.trim();
  if (name_trimed.startsWith('[')) {
    name_trimed = name_trimed.substring(name_trimed.indexOf(']') + 1).trim();
  }
  return name_trimed;
}

function convertMultiSelectToNameObjArray(multi_select) {
  return multi_select.map((x) => {return {name: x.name}});
}

async function syncDB() {
  try {
    console.log('Starting interval');

    const tasks = await getTasks();

    for (const t of tasks) {


      if (statusMapList.length === 0 || statusMapList.find((x) => x.db1_id === t.db1_id && x.db2_id === t.db2_id) === undefined) {
        statusMapList.push({db1_id: t.db1_id, db2_id: t.db2_id, statusMap: await getStausIdMap(t.db1_id, t.db2_id)});
      }

      const statusMap = statusMapList.find((x) => x.db1_id === t.db1_id && x.db2_id === t.db2_id).statusMap;


      let db1 = await queryDatabase(t.db1_id, JSON.parse(t.db1_filter));
      let db2 = await queryDatabase(t.db2_id, JSON.parse(t.db2_filter));

    

      let db1_rows = db1.results;
      let db2_rows = db2.results;

      //sync db1 and db2
      //for each item in db1, check if it exists in db2
      //if it doesn't exist, create it in db2
      //if it exists, update it in db2
      //and vice versa
      for (const db1_row of db1_rows) {
        if (db1_row.properties.Course.multi_select.length === 0 || db1_row.properties["Semester"].multi_select.length === 0) {
          continue;
        }
        let db2_row = db2_rows.find((r) => nameCleaner(r.properties["Event"].title[0].text.content) === nameCleaner(db1_row.properties["Task name"].title[0].text.content)
                                  && r.properties.Course.multi_select[0].name === db1_row.properties.Course.multi_select[0].name
                                  && r.properties["Semester"].multi_select[0].name === db1_row.properties["Semester"].multi_select[0].name);

        let db1_last_edited_time = new Date(db1_row.last_edited_time);
        let db2_last_edited_time = db2_row ? new Date(db2_row.last_edited_time) : null;
        if (db2_row) {
          //update db2_row
          if (db1_last_edited_time > db2_last_edited_time && (db1_row.properties["Due"].date != db2_row.properties["Date"].date || db1_row.properties["Status"].status.name != db2_row.properties["Status"].status.name)) {
            console.log('update'+ db2_row.properties["Event"].title[0].text.content + ' ' + db1_row.properties.Course.multi_select[0].name);
            await notion.pages.update({
              page_id: db2_row.id,
              properties: {
                "Date": {"date": db1_row.properties["Due"].date},
                "Status": {"status": {"id": statusMap[db1_row.properties["Status"].status.name].db2}},
              }
            });
          }
          
        } else if (db1_row.properties.Course.multi_select.length > 0 && db1_row.properties["Semester"].multi_select.length > 0) {
          //create db2_row
          console.log('create'+ db1_row.properties["Task name"].title[0].text.content);
          await notion.pages.create({
            parent: { 
              "type": "database_id",
              "database_id": t.db2_id },
            properties: {
              "Event": {"title": db1_row.properties["Task name"].title},
              "Course": {"multi_select": convertMultiSelectToNameObjArray(db1_row.properties["Course"].multi_select)},
              "Semester": {"multi_select": convertMultiSelectToNameObjArray(db1_row.properties["Semester"].multi_select)},
              "Date": {"date": db1_row.properties["Due"].date},
              "Status": {"status": {"id": statusMap[db1_row.properties["Status"].status.name].db2}},
              "Type": {"multi_select": [{"name":"YT课程安排"}]},
            }
          });
        }
      }
      console.log(`[${new Date().toLocaleString()}] Task: ${t.id}) Synced db1 to db2`);

      db1 = await queryDatabase(t.db1_id, JSON.parse(t.db1_filter));
      db2 = await queryDatabase(t.db2_id, JSON.parse(t.db2_filter));

      db1_rows = db1.results;
      db2_rows = db2.results;

      //sync db2 to db1
      for (const db2_row of db2_rows) {
        if (db2_row.properties.Course.multi_select.length === 0 || db2_row.properties["Semester"].multi_select.length === 0) {
          continue;
        }
        let db1_row = db1_rows.find((r) => nameCleaner(r.properties["Task name"].title[0].text.content) === nameCleaner(db2_row.properties["Event"].title[0].text.content)
                                  && r.properties.Course.multi_select[0].name === db2_row.properties.Course.multi_select[0].name
                                  && r.properties["Semester"].multi_select[0].name === db2_row.properties["Semester"].multi_select[0].name);
        let db1_last_edited_time = db1_row ? new Date(db1_row.last_edited_time) : null;
        let db2_last_edited_time = new Date(db2_row.last_edited_time);
        if (db1_row) {
          //update db1_row
          if (db2_last_edited_time > db1_last_edited_time && (db2_row.properties["Date"].date != db1_row.properties["Due"].date || db2_row.properties["Status"].status.name != db1_row.properties["Status"].status.name)) {
            console.log('update'+ db1_row.properties["Task name"].title[0].text.content);
            await notion.pages.update({
              page_id: db1_row.id,
              properties: {
                "Due": {"date": db2_row.properties["Date"].date},
                "Status": {"status": {"id": statusMap[db2_row.properties["Status"].status.name].db1}},
              }
            });
          }
          
        } else if (db2_row.properties.Course.multi_select.length > 0 && db2_row.properties["Semester"].multi_select.length > 0) {
          //create db1_row
          console.log('create'+ db2_row.properties["Event"].title[0].text.content);
          await notion.pages.create({
            parent: { 
              "type": "database_id",
              "database_id": t.db1_id },
            properties: {
              "Task name": {"title": db2_row.properties["Event"].title},
              "Course": {"multi_select": convertMultiSelectToNameObjArray(db2_row.properties["Course"].multi_select)},
              "Semester": {"multi_select": convertMultiSelectToNameObjArray(db2_row.properties["Semester"].multi_select)},
              "Due": {"date": db2_row.properties["Date"].date},
              "Status": {"status": {"id": statusMap[db2_row.properties["Status"].status.name].db1}},
              "Type": {"multi_select": [{"name":"YouTutor"}]},
            }
          });
        }

      }
      console.log(`[${new Date().toLocaleString()}] Task: ${t.id}) Synced db2 to db1`);

      
    }
    console.log(`[${new Date().toLocaleString()}] Sync Interval Task Finished`);
  } catch (error) {
    console.error(`[${new Date().toLocaleString()}] Error: ${error}`);
  }
}


function startInterval(timeInterval) {
    setInterval(() => {
        syncDB();
    }, timeInterval);
}



app.listen(process.env.PORT || 3000, async () => {
    await initDB();
    startInterval(process.env.TASKS_INTERVAL);


    console.log(`Server is running on port ${process.env.PORT || 3000}`)
})
