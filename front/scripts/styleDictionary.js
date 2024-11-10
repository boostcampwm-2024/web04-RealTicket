import { makeSdTailwindConfig } from 'sd-tailwindcss-transformer';
import StyleDictionary from 'style-dictionary';

StyleDictionary.registerTransform({
  type: `value`,
  transitive: true,
  name: `tailwind/object`,
  filter: function (token) {
    return token.attributes.category === 'fontSize';
  },
  transform: function ({ value }) {
    const { fontSize, fontWeight, lineHeight } = value;
    return [`${fontSize / 16}rem`, { fontWeight, lineHeight: `${lineHeight / 16}rem` }];
  },
});

const TYPE_LIST = ['colors', 'fontSize'];
for (const TYPE of TYPE_LIST) {
  const config = makeSdTailwindConfig({
    type: TYPE,
    source: ['style/tokens/*.json'],
    buildPath: 'style/tailwindConfig/',
    formatType: 'cjs',
    transforms: ['attribute/cti', 'name/kebab', 'tailwind/object'],
  });

  const styleDictionary = new StyleDictionary(config);
  await styleDictionary.buildAllPlatforms();
}
