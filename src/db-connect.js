import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql';

export default class DbConnect {
  constructor() {
    this.initConnection();
  }

  async initConnection() {
    const filePath = path.resolve('config', 'db-credentials.json');
    const file = await fs.readFile(filePath, 'utf-8');
    const dbCredentials = JSON.parse(file)
    this.connection = mysql.createConnection(dbCredentials);

    this.connection.connect((err) => {
      if (err) {
        console.error("Error connecting to the database: ", err.stack);
        return;
      }
      console.log(`Connected to the database \x1b[33m${dbCredentials.host}\x1b[0m/\x1b[33m${dbCredentials.database}\x1b[0m as \x1b[33m${dbCredentials.user}\x1b[0m`);
    });
  }

  query(statement) {
    return new Promise((resolve, reject) => {
      this.connection.query(statement, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }
}