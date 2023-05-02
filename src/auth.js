import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export default class Auth {
    constructor(db) {
        this.db = db;
    }

    async login(data) {
        const emailRegex = /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/;
        const loginWith = emailRegex.test(data.user) ? "email" : "username";
        const wording = (loginWith === "email") ? "denne email" : "dette brugernavn";
        let user;
        try {
            user = await this.#getUser(loginWith, data.user);
        } catch (err) {
            return {
                status: 1,
                msg: `Der opstod en fejl ved at logge dig ind.\n${err}`
            }
        }
        if (user === null) {
            return {
                status: 1,
                msg: `En bruger med ${wording} eksisterer ikke.`
            };
        }
        if (await bcrypt.compare(data.password, user.password)) {
            let token = "";
            try {
                token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
            } catch (err) {
                return {
                    status: 1,
                    msg: `Fejl ved at generere JWT.\n${err}`
                }
            }
            const res = {
                status: 0,
                token: token,
                username: user.username
            };
            return res;
        } else {
            return {
                status: 1,
                msg: "Den indtastede adgangskode er forkert."
            };
        }
    }

    async signup(data) {
        const emailRegex = /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/;
        if (!emailRegex.test(data.email)) {
            return {
                status: 1,
                msg: "Emailadressen er ikke gyldig."
            }
        }
        if (await this.#usernameExists(data.username)) { // If username exists
            return {
                status: 1,
                msg: "Brugernavnet eksisterer allerede"
            }
        } else if (await this.#emailExists(data.email)) { // If email exists
            return {
                status: 1,
                msg: "En bruger med denne email-adresse eksisterer allerede"
            }
        } else {
            let hashedPwd = await bcrypt.hash(data.password, 10);
            try {
                await this.#addUser(data.username, data.email, hashedPwd);
            } catch (err) {
                return {
                    status: 1,
                    msg: `Der opstod en fejl ved at oprette din bruger.\n${err}`
                }
            }
	        return this.login({
                user: data.email,
                password: data.password,
            })
        }
    }

    async getEludbyder(uid) {
        const statement = `SELECT eludbyder FROM users WHERE id=${uid};`;
        const response = await this.db.query(statement);
        return response[0];
    }

    async setEludbyder(uid, eludbyder) {
        const statement = `UPDATE users
        SET eludbyder = '${eludbyder}'
        WHERE id = ${uid};`;
        await this.db.query(statement);
    }

    async getDevices(uid) {
        const statement = `SELECT * FROM devices WHERE users_id=${uid};`;
        return await this.db.query(statement);
    }

    async #usernameExists(username) {
        const statement = `SELECT * FROM users WHERE username=${this.db.connection.escape(username)};`;
        const response = await this.db.query(statement);
        return !!response.length;
    }

    async #emailExists(email) {
        const statement = `SELECT * FROM users WHERE email=${this.db.connection.escape(email)};`;
        const response = await this.db.query(statement);
        return !!response.length;
    }

    async #addUser(username, email, password) {
        const statement = `INSERT INTO users(username, email, password) 
        VALUES (${this.db.connection.escape(username)}, ${this.db.connection.escape(email)}, ${this.db.connection.escape(password)});`;
        await this.db.query(statement);
    }

    async #getUser(loginWith, user) {
        const statement = `SELECT * FROM users WHERE ${loginWith}=${this.db.connection.escape(user)};`;
        const response = await this.db.query(statement);
        if (!response.length) {
            return null;
        }
        return response[0];
    }
}