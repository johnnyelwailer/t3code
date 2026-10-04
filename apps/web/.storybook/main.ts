// Storybook's CLI resolves the config directory by file name (`main.ts`), while this repo
// keeps the actual config under src/t3team/storybook. These two files are the bridge:
// everything substantive — story globs, vite plugins, subpath resolver, defines — lives in
// the source files and is untouched here.
export { default } from "../src/t3team/storybook/t3team-storybook-main";
