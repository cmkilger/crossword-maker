import { generate } from "./generator.js";
self.onmessage = ({ data }) => {
  let last = -Infinity;
  const layout = generate(data.entries, {
    budget: data.budget,
    onProgress: (layout) => {
      if (performance.now() - last > 100) {
        self.postMessage({ layout, done: false });
        last = performance.now();
      }
    },
  });
  self.postMessage({ layout, done: true });
};
