import { productTypeScriptGlobs } from "./product-typescript-globs.mjs";

const stagedProductTypeScriptGlob = `{${productTypeScriptGlobs.join(",")}}`;

export default {
  [stagedProductTypeScriptGlob]: "eslint --fix --no-warn-ignored",
  "*": "prettier --write --ignore-unknown",
};
