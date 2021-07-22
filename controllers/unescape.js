
module.exports = (escaped, char) => function (req, res, next) {
  unescapeCharacter(req.params, escaped, char);
  unescapeCharacter(req.query, escaped, char);
  unescapeCharacter(req.body, escaped, char);
  return next();
};

function unescapeCharacter (obj, escaped, char) {
  if (obj) {
    for (const key in obj) {
        // Replace the escaped version with the character
        let propValue = obj[key].toString();
        propValue = propValue.replace(new RegExp(escaped, "g"), char);
        obj[key] = propValue;
    }
  }
}