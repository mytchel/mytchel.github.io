import regression from "regression";
import { data } from "../src/data.js";

let resultPolynomial = regression.polynomial(data, {
  order: 2,
  precision: 10
});

let   dataPolynomial = [];

for (let i = 0; i < resultPolynomial.points.length; i++) {
  // dataPolynomial.push([data[i][0], resultPolynomial.points[i][1]]);
}

for (let i = 0; i < 100; i++) {
  let y = resultPolynomial.predict(i);
  dataPolynomial.push(y)
}

export {  dataPolynomial, resultPolynomial };
