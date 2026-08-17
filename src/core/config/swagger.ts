import swaggerJSDoc from "swagger-jsdoc";
import { env } from "./env.js";

const options: swaggerJSDoc.Options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "YOGODA API",
            version: "1.0.0",
            description: "YOGODA 프로젝트 API 문서",
        },
        servers: [
            {
                url: "/",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
    },
    apis: [
        env.NODE_ENV === "production"
            ? "./dist/api/**/*.js"
            : "./src/api/**/*.ts",
    ],
};

export const swaggerSpec = swaggerJSDoc(options);
