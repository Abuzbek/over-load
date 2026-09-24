module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // .svg: the muscle-group thumbnails, inlined as markup for SvgXml.
    plugins: [['inline-import', { extensions: ['.sql', '.svg'] }]],
  };
};
