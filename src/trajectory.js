import regression from "regression";
import Highcharts from "highcharts";
import { data } from "../src/data.js";

let radian = 0.01745329;
let feet_to_m = 0.3048;
let yard_to_m = 0.9144;

let g = 9.80665;

let t_step = 0.001;
let y_error = 0.0001;
let x_error = 0.0001;
let v_error = 0.0001 * feet_to_m;
let c_error = 0.000001
let tries = 100;

let v_guess = 200
let c_guess = 0.03

let drag_coefficient = 0.03;

function angleToMark(sight_settings, a, t) {
  let m1 = Math.sin(a) * sight_settings.nock_to_pin;
  
  let o = Math.atan(t / sight_settings.nock_to_eye);
  
  let m2 = Math.tan(Math.PI/2 - o) * sight_settings.nock_to_pin;
  
  let d = m2 + m1;
  
  let mm_per_turns = 25.4 / sight_settings.tpi;
  let m = d * 1000 / mm_per_turns / sight_settings.sight_scale;

  return m;
}

function calc(v, c, a, t) {
  let vv = v * t * Math.pow(Math.E, -c * t);
  let x = (vv * Math.cos(a));
  let y = (vv * Math.sin(a)) - (0.5 * g * Math.pow(t,2)); 

  return [x, y];
}

function calc_t(v, a, x) {
  return x / (v * Math.cos(a));
}

function getAngle(v, c, d) {
  var a_min = 0 * radian;
  var a_max = 10 * radian;
  var a = a_min + (a_max - a_min) / 2;

  for (let i = 0; i < tries; i++) {
    let t_guess = calc_t(v, a, d);
  
    var t_max = t_guess * 1.2;
    var t_min = t_guess * 0.8;
    var t = t_guess;
    for (let j = 0; j < tries; j++) {
      var [x, y] = calc(v, c, a, t);

      if (Math.abs(x - d) < x_error) {
        // console.log("found t " + t + " after " + j + " tries");
        break;
      } else if (x < d) {
        t_min = t;
      } else {
        t_max = t;
      }
        
      t = t_min + (t_max - t_min) / 2;
    }

    var [x, y] = calc(v, c, a, t);

    if (Math.abs(y) < y_error) {
      // console.log("found angle " + a + " for distance " + d + " after " + i + " tries");
      return a;

    } else if (y < 0) {
      a_min = a;
    } else {
      a_max = a;
    }
      
    a = a_min + (a_max - a_min) / 2;
  }

  return 0
}

function calc_offset(sight_settings, data, v, c) {
  var errors = [];
  for (let i = 0; i < data.length; i++) {
    let [d, m] = data[i];
    let m_calc = angleToMark(sight_settings, getAngle(v, c, d), d);
    let diff = m - m_calc;
   
    errors.push([d, diff]);
    
    // console.log("error for " + v / feet_to_m + " at " + d + " = " + m + " vs calc " + m_calc + " = " + diff);
  }

  let result = regression.linear(errors, { precision: 10 } );

  let gradient = result.equation[0];
  let offset = result.equation[1];

  var score = 0;
  for (let i = 0; i < errors.length; i++) {
    let d = errors[i][0];
    let diff = errors[i][1];
    score += Math.abs(diff - offset);
  }

  return [ offset, gradient, score ];
}

function findVelocity(sight_settings, data, c) {
  var v = v_guess * feet_to_m;
  let v_max = v * 1.5;
  let v_min = v * 0.8;

  var v_best = v;
  var error_best = 1000;

  for (let i = 0; i < tries; i++) {
    let [offset, gradient, score] = calc_offset(sight_settings, data, v, c);

    // console.log("test v " + v / feet_to_m + " offset " + offset + " gradient " + gradient);

    let error = Math.abs(gradient);

    if (error < error_best) {
      error_best = error;
      v_best = v;
    }
    
    if (gradient < 0) {
      v_min = v;
    } else {
      v_max = v;
    }

    v = v_min + (v_max - v_min) / 2;

    if (v_max - v_min < v_error) {
      // console.log("v range below error " + v_min + " to " + v_max);
      break;
    }
  }

  return v_best;
}

function findVelocityAndDrag(sight_settings, data) {
  let v_best = 0;
  let c_best = 0;
  let error_best = 1000;

  let c = c_guess;
  let c_min = c_guess * 0.1;
  let c_max = c_guess * 5;

  for (let i = 0; i < tries; i++) {
    let v = findVelocity(sight_settings, data, c);

    let [offset, gradient, score] = calc_offset(sight_settings, data, v, c);

    console.log("c = " + c + " then v = " + v / feet_to_m + " gradient = " + gradient + " score = " + score);

    let error = score 
    if (error < error_best) {
      error_best = error;
      v_best = v;
      c_best = c;
    }

    // continue;

    if (gradient < 0) {
      c_min = c;
    } else {
      c_max = c;
    }


    if (c_max - c_min < c_error) {
      break;
    }

    c = c_min + (c_max - c_min) / 2;
  }

  return [v_best, c_best]
}

function maxHeight(v, c, d) {
  var max = 0;

  let a = getAngle(v, c, d);

  for (let t = 0; t < 10; t += t_step) {
    let [x, y] = calc(v, c, a, t);

    if (x > d + x_error) break;
    if (y > max) {
      max = y;
    }
  }

  return max;
}

function drawTrajectory(ctx, x_scale, y_scale, launch_x, launch_y, unit, h, v, c, d) {
  ctx.beginPath();
  ctx.moveTo(launch_x, launch_y);

  let a = getAngle(v, c, d * unit);

  for (let t = 0; t < 10; t += t_step) {
    let [x, y] = calc(v, c, a, t);

    if (x > d * unit + x_error) break;

    ctx.lineTo(launch_x + x * x_scale, launch_y - y * y_scale);
  }

  ctx.stroke();

  const target = new Path2D();
  target.rect(launch_x + d * unit * x_scale, launch_y - h/2, 5, h);

  ctx.stroke(target);

  ctx.fillText(d + toUnitName(unit), launch_x + d * unit * x_scale, launch_y + h/2 + 5);
}

function drawTrajectories(canvas, unit, dists, v, c, offset) {
  let max_x = dists[dists.length - 1] * unit + 10;
  let max_y = maxHeight(v, c, max_x);

  var rect = canvas.parentNode.getBoundingClientRect();
  
  let x_scale = rect.width / max_x;
  let y_scale = 100;

  canvas.width = rect.width;
  canvas.height = (2 + max_y) * y_scale + 100;

  console.log("max x = " + max_x);
  console.log("max y = " + max_y);
  console.log("x scale = " + x_scale);
  console.log("y scale = " + y_scale);
  console.log("width = " + canvas.width);
  console.log("height = " + canvas.height);

  let bottom = canvas.height;

  let launch_x = 100;
  let launch_y = bottom - 2 * y_scale;

  let h = 1.22 * y_scale;

  const ctx = canvas.getContext("2d");

  const bow = new Path2D();
  bow.rect(launch_x, launch_y - h/2, 5, h);
  ctx.stroke(bow);

  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.font = "48px serif";
  ctx.fillText("Trajectory", canvas.width / 2, 5);
  
  ctx.font = "16px serif";
  ctx.fillText("0", launch_x, launch_y + h/2 + 5);

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = 0; y < 3; y += 0.25) {
    if (y * unit * y_scale > canvas.height - 100) break;

    ctx.fillText(y + toUnitName(unit), launch_x - 10, launch_y - y * unit * y_scale);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < dists.length; i++) {
    let d = dists[i];
    drawTrajectory(ctx, x_scale, y_scale, launch_x, launch_y, unit, h, v, c, d);
  }
}

function toScale(unit) {
  if (unit == "m") {
    return 1;
  } else if (unit == "yd") {
    return yard_to_m;
  } else if (unit == "ft") {
    return feet_to_m;
  } else {
    throw new Error("unknown unit");
  }
}

function toUnitName(scale) {
  if (scale == 1) {
    return "m";
  } else if (scale == yard_to_m) {
    return "yd";
  } else if (scale == feet_to_m) {
    return "ft";
  } else {
    throw new Error("unknown unit");
  }
}
function getMarks(unit, sight_settings, v, c, offset, min, max, step) {
  var data = [];

  for (let i = min; i <= max; i += step) {
    let d = i * unit;
    let a = getAngle(v, c, d);
    let m = angleToMark(sight_settings, a, d);
    let actual = m + offset;

    data.push([i, actual]);
  }

  return data;
}

function populateMarks(table, unit, sight_settings, v, c, offset) {
  let data = getMarks(unit, sight_settings, v, c, offset, 1, 100, 1);

  table.innerHTML = "";
  for (let i = 0; i < data.length; i++) {
    let dist = data[i][0].toString() + toUnitName(unit);
    let mark = data[i][1].toFixed(3);

    var newRow = table.insertRow(table.rows.length);
    var distCell = newRow.insertCell(0);
    var markCell = newRow.insertCell(1);
    var distText = document.createTextNode(dist);
    var markText = document.createTextNode(mark);
    distCell.appendChild(distText);
    markCell.appendChild(markText);
  }
}

function graphMarks(div, unit, sight_settings, v, c, offset, measured) {
  let data = getMarks(unit, sight_settings, v, c, offset, 1, 100, 0.25);

  var measuredInUnit = [];
  for (let i = 0; i < measured.length; i++) {
    measuredInUnit.push([measured[i][0] / unit, measured[i][1]]);
  }

  Highcharts.chart(div, {
    title: {
      text: "Sight marks"
    },

    yAxis: {
      title: {
        text: "Mark"
      },
      max: 10,
      min: 0,
      reversed: true,
    },

    xAxis: {
      type: "linear",
      title: {
        text: "Distance (" + toUnitName(unit) + ")"
      }
    },

    tooltip: {
      shared: true,
      valueDecimals: 2
    },

    plotOptions: {
      series: {
        label: {
          connectorAllowed: false
        },
        pointStart: 0,
        pointInterval: 1
      }
    },

    series: [
      {
        name: "Marks",
        color: "#FF0000",
        type: "line",
        marker: {
          enabled: false
        },
        data: data,
      },      
      {
        name: "Measured",
        color: "#808080",
        type: "scatter",
        marker: {
          enabled: true
        },
        data: measuredInUnit
      }
    ]
  });
}

function readMarks(table) {
  var data = [];

  console.log("have " + table.rows.length + " rows");

  for (let i = 0; i < table.rows.length; i++) {
    const cells = table.rows[i].cells;
   
    console.log("row " + i + " has " + cells.length + " cells");

    const dist = cells[0].querySelector("input")?.value;
    const mark = cells[1].querySelector("input")?.value;
    const unit = cells[2].querySelector("select")?.value;

    const d = parseFloat(dist);

    data.push([
      d * toScale(unit),
      parseFloat(mark)
    ]);
  }

  data.sort((a, b) => a[0] - b[0]);

  console.log("have data: " + data);

  return data;
}

function calculate() {
  console.log("Recalculating");

  let sight_settings = {
    nock_to_pin: document.getElementById('nock_to_pin').value / 1000,
    nock_to_eye: document.getElementById('nock_to_eye').value / 1000,
    tpi: document.getElementById('sight_tpi').value,
    sight_scale: document.getElementById('sight_scale').value,
  };

  var table = document.getElementById('input_marks');
  let data = readMarks(table);

  let unit = toScale(document.getElementById("calc_unit").value);

  let [v, c] = findVelocityAndDrag(sight_settings, data);

  let [offset, gradient, score] = calc_offset(sight_settings, data, v, c);

  let v_fps = v / feet_to_m;
  document.getElementById("velocity").innerText = v_fps.toFixed(3) + " fps";
  document.getElementById("drag").innerText = c.toFixed(5);
  document.getElementById("fit_score").innerText = score.toFixed(5);

  graphMarks("graph", unit, sight_settings, v, c, offset, data);

  const canvas = document.getElementById("trajectory");

  let dists = [3, 5, 10, 18, 20, 25, 30, 50, 70, 80];
  drawTrajectories(canvas, unit, dists, v, c, offset);

  var marksBody = document.getElementById('marks');
  populateMarks(marksBody, unit, sight_settings, v, c, offset);
}

document.getElementById("calculate").onclick = function() {
  calculate();
};

function setDefaults() {
  console.log("Setting sight defaults");

  document.getElementById('sight_tpi').value = '24';
  document.getElementById('sight_scale').value = '10';
  document.getElementById('nock_to_pin').value = '1020';
  document.getElementById('nock_to_eye').value = '110';

  console.log("Setting mark defaults");

  var defaultMarks = document.getElementById('input_marks');

  for (let i = 0; i < data.length; i++) {
    if (i > 0) {
      console.log("Cloning mark");
      var clone = defaultMarks.rows[i - 1].cloneNode(true);
      defaultMarks.appendChild(clone);
    }
    
    console.log("Setting mark");
    const cells = defaultMarks.rows[i].cells;
     
    cells[0].querySelector("input").value = data[i][0];
    cells[1].querySelector("input").value = data[i][1];
    cells[2].querySelector("select").value = "m";
  }
}

setDefaults();
calculate();

