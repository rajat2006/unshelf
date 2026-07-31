export default {
  "{apps/api/{src,test}/**/*.ts,apps/api/{drizzle,vitest}.config.ts,apps/web/{src,test}/**/*.{ts,tsx},apps/web/{playwright,vite}.config.ts,packages/shared/{src,test}/**/*.ts}":
    "eslint --fix --no-warn-ignored",
  "*": "prettier --write --ignore-unknown",
};
