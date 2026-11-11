import { defineConfig } from "vite";
import { copyFileSync } from "node:fs";
export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "license-notices",
      closeBundle() {
        for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
          copyFileSync(file, `dist/${file}`);
      },
    },
  ],
});
