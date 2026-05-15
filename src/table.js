import { dataPolynomial } from "../src/statistics.js";

var tableBody = document.getElementById('calcBody');

for (let i = 0; i < dataPolynomial.length; i++) {
  let v = dataPolynomial[i];
  let dist = v[0].toString() + "m";
  let mark = v[1].toFixed(3);

  var newRow = tableBody.insertRow(tableBody.rows.length);
  var distCell = newRow.insertCell(0);
  var markCell = newRow.insertCell(1);
  var distText = document.createTextNode(dist);
  var markText = document.createTextNode(mark);
  distCell.appendChild(distText);
  markCell.appendChild(markText);
}

