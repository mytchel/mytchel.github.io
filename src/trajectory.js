import regression from "regression";
import Highcharts from "highcharts";

let radian = 0.01745329;
let feet_to_m = 0.3048;
let yard_to_m = 0.9144;

let g = 9.80665;

let t_step = 0.001;
let c_step = 0.0001;
let y_error = 0.0001;
let x_error = 0.0001;
let v_error = 0.0001 * feet_to_m;
let c_error = 0.000001
let tries = 100;

let v_guess = 200
let c_guess = 0.03

let drag_coefficient = 0.03;

function cutDists(d, cut_angle) {
  let x_target = Math.cos(cut_angle) * d;
  let y_target = Math.sin(cut_angle) * d;

  return [x_target, y_target];
}

// TODO: compound
// and take into account the sight bar angling
// it also is wrong for very close, point blank shouldn't read as much more than 10, it should zero on the arrow. Do I need to have arrow to sight zero measured?
// do I need to account for the eye not being directly above the arrow?
// Should the measure be eye to pin, not nock to pin?
//
// raising the bow raises the peep?
//
function angleToMark(sight_settings, a, d, cut_angle) {
  // let m1 = Math.tan(a) * sight_settings.nock_to_pin;

  let [x_target, y_target] = cutDists(d, cut_angle);

  console.log("angle to mark for d " + d + " cut " + cut_angle + " so x " + x_target + " and " + y_target + " a = " + a / radian);

  let eye_x = Math.sin(a) * sight_settings.nock_to_eye + x_target;
  let eye_y = Math.cos(a) * sight_settings.nock_to_eye - y_target;
  console.log("eye to target  " + eye_x + " and " + eye_y);
  // needs to take into acount tilt of eye over nock with a changing.
  let o = Math.atan(eye_y / eye_x);
  
  console.log("o = " + o / radian);
  
  let m = Math.tan(a + o) * sight_settings.nock_to_pin;
  
  // console.log("m2 = " + m2);
  
  // let m = m2 + m1;
  
  console.log("m = " + m);

  let mm_per_turns = 25.4 / sight_settings.tpi;
  let mark = m * 1000 / mm_per_turns / sight_settings.sight_scale;

  //  console.log("angle to mark for a " + a.toFixed(5) + " at d " + t.toFixed(0) + " o = " + o.toFixed(3) + " m1 = " + m1.toFixed(3) + " m2 = " + m2.toFixed(3));

  return mark;
}

function calc(v, c, a, t) {
  let vv = v * Math.pow(Math.E, -c * t);
  let x = (vv * t * Math.cos(a));
  let y = (vv * t * Math.sin(a)) - (0.5 * g * Math.pow(t,2)); 

  return [x, y, vv];
}

function estimateT(v, a, x) {
  return x / (v * Math.cos(a));
}

function findImpact(v, c, a, d) {
  let t_guess = estimateT(v, a, d);

  var t_max = t_guess * 1.2;
  var t_min = t_guess * 0.8;
  var t = t_guess;
  for (let j = 0; j < tries; j++) {
    var [x, y, vv] = calc(v, c, a, t);

    if (Math.abs(x - d) < x_error) {
      return [y, vv];
    } else if (x < d) {
      t_min = t;
    } else {
      t_max = t;
    }
      
    t = t_min + (t_max - t_min) / 2;
  }

  return [0, 0]; 
}

function findAngle(v, c, d, cut_angle) {
  let [x_target, y_target] = cutDists(d, cut_angle);

  var a = cut_angle * radian;
  var a_min = a - 90 * radian;
  var a_max = a + 90 * radian;

  for (let i = 0; i < tries; i++) {
    let [y, vv] = findImpact(v, c, a, x_target);

    if (Math.abs(y - y_target) < y_error) {
      // console.log("found angle " + a + " for distance " + d + " after " + i + " tries");
      return [a, vv];

    } else if (y < y_target) {
      a_min = a;
    } else {
      a_max = a;
    }
      
    a = a_min + (a_max - a_min) / 2;
  }

  throw new Error("Failed to find angle for distance: " + d);
}

function calcOffset(sight_settings, data, v, c) {
  var errors = [];
  for (let i = 0; i < data.length; i++) {
    let [d, m] = data[i];
    let [a, vv] = findAngle(v, c, d, 0);
    let m_calc = angleToMark(sight_settings, a, d, 0);
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
  let v_max = v * 2;
  let v_min = v * 0.7;

  for (let i = 0; i < tries; i++) {
    let [offset, gradient, score] = calcOffset(sight_settings, data, v, c);

    // console.log("test v " + v / feet_to_m + " offset " + offset + " gradient " + gradient);

    if (gradient < 0) {
      v_min = v;
    } else {
      v_max = v;
    }

    v = v_min + (v_max - v_min) / 2;

    if (v_max - v_min < v_error) {
      // console.log("v range below error " + v_min + " to " + v_max);
      return v;
    }
  }

  throw new Error("Failed to find velocity for c = " + c);
}

function findVelocityAndDrag(sight_settings, data) {
  if (data.length < 3) {
    console.log("Not enought data points for proper drag calculation");
    let c = 0.05;
    let v = findVelocity(sight_settings, data, c);
    return [v, c];
  }

  let v_best = 0;
  let c_best = 0;
  let error_best = 1000;

  let c_min = 0;
  let c_max = c_guess * 10;

  while (c_max - c_min > c_error) {
    let c_step = (c_max - c_min) / 10;

    console.log("check from " + c_min + " to " + c_max + " each " + c_step);

    for (let c = c_min; c < c_max; c += c_step) {
      try {
        let v = findVelocity(sight_settings, data, c);

        let [offset, gradient, score] = calcOffset(sight_settings, data, v, c);

        console.log("c = " + c + " then v = " + v / feet_to_m + " score = " + score);

        let error = score 
        if (error < error_best) {
          error_best = error;
          v_best = v;
          c_best = c;
        }

      } catch (error) {
        console.log(error);
        continue;
      }
    }

    c_min = Math.max(c_best - c_step, 0);
    c_max = c_best + c_step;
  }

  if (v_best == 0) {
    throw new Error("Failed to find velocity and drag");
  }

  return [v_best, c_best]
}


function maxHeight(v, c, d, cut_angle) {
  var max = 0;

  let [x_target, y_target] = cutDists(d, cut_angle);
  let [a, vv] = findAngle(v, c, d, cut_angle);

  for (let t = 0; t < 10; t += t_step) {
    let [x, y] = calc(v, c, a, t);

    if (x > x_target + x_error) break;
    if (y > max) {
      max = y;
    }
  }

  return max;
}

function drawTrajectory(ctx, x_scale, y_scale, launch_x, launch_y, unit, h, v, c, d, cut_angle) {
  let [x_target, y_target] = cutDists(d * unit, cut_angle);
  let [a, vv] = findAngle(v, c, d * unit, cut_angle);

  ctx.beginPath();
  ctx.moveTo(launch_x, launch_y);

  for (let t = 0; t < 10; t += t_step) {
    let [x, y] = calc(v, c, a, t);

    if (x > x_target + x_error) break;

    ctx.lineTo(launch_x + x * x_scale, launch_y - y * y_scale);
  }

  ctx.stroke();

  const target = new Path2D();
  target.rect(launch_x + x_target * x_scale, launch_y - h/2 - y_target * y_scale, 5, h);

  ctx.stroke(target);

  ctx.fillText(d + toUnitName(unit), launch_x + x_target * x_scale, launch_y + h/2 + 5 - y_target * y_scale);
}

function drawTrajectories(v, c, offset, cut_angle) {
  let dists = [3, 18, 20, 30, 50, 70, 90];

  let unit = toScale(document.getElementById("calc_unit").value);

  const canvas = document.getElementById("trajectory_canvas");

  var max_x = 0;
  var max_y = 0;
  var min_y = 0;

  for (let i = dists.length - 1; i >= 0; i--) {
    try {
      console.log("Try get max height for " + dists[i]);
      let x = dists[i] * unit;
      max_y = maxHeight(v, c, x, cut_angle);
      let [x_target, y_target] = cutDists(x, cut_angle);
      max_x = x_target;
      min_y = Math.min(0, y_target);
      break;
    } catch (error) {
      console.log("Failed to get max height for " + dists[i] + " : " + error);
    }
  }

  console.log("max x = " + max_x + " max y = " + max_y + " min y = " + min_y);

  var rect = canvas.parentNode.getBoundingClientRect();
  
  let x_scale = rect.width / (max_x + 20);
  let y_scale = 30;

  canvas.width = rect.width;
  canvas.height = (2 + max_y - min_y) * y_scale + 100;

  console.log("max x = " + max_x);
  console.log("max y = " + max_y);
  console.log("x scale = " + x_scale);
  console.log("y scale = " + y_scale);
  console.log("width = " + canvas.width);
  console.log("height = " + canvas.height);

  let bottom = canvas.height;

  let launch_x = 100;
  let launch_y = bottom - (2 - min_y) * y_scale;

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
  for (let y = Math.floor(min_y / unit); y < Math.ceil(max_y / unit); y += 0.5) {
    if (y * unit * y_scale > canvas.height - 100) break;

    ctx.fillText(y + toUnitName(unit), launch_x - 10, launch_y - y * unit * y_scale);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < dists.length; i++) {
    let d = dists[i];

    try {
      drawTrajectory(ctx, x_scale, y_scale, launch_x, launch_y, unit, h, v, c, d, cut_angle);
    } catch (error) {
      console.log("Failed to draw trajectory for " + d + " : " + error);
    }
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

function populateMarks(sight_settings, v, c, offset, cut_angle) {
  let unit = toScale(document.getElementById("calc_unit").value);
  
  var table = document.getElementById('marks');

  table.innerHTML = "";

  for (let i = 1; i <= 50; i += 1) {
    try {
      let d = i * unit;

      let [a, vv] = findAngle(v, c, d, cut_angle);
      let m = angleToMark(sight_settings, a, d, cut_angle);
      let actual = m + offset;

      let [x_target, y_target] = cutDists(d, cut_angle);

      let impactBefore = findImpact(v, c, a, x_target - 0.5)[0];
      let impactAfter = findImpact(v, c, a, x_target + 0.5)[0];
      let drop = impactAfter - impactBefore;

      console.log("mark for " + d + " at (" + x_target + "," + y_target + ") a = " + a + " m = " + actual + " impact before " + impactBefore + " and after " + impactAfter);

      let distText = document.createTextNode(i.toString() + toUnitName(unit));
      let markText = document.createTextNode(actual.toFixed(3));
      let vvText = document.createTextNode((vv / feet_to_m).toFixed(3));
      let dropText = document.createTextNode((drop * 100).toFixed(1) + "cm");

      var newRow = table.insertRow(table.rows.length);
      var distCell = newRow.insertCell(0);
      var markCell = newRow.insertCell(1);
      var vvCell = newRow.insertCell(2);
      var dropCell = newRow.insertCell(3);
      distCell.appendChild(distText);
      markCell.appendChild(markText);
      vvCell.appendChild(vvText);
      dropCell.appendChild(dropText);
    } catch (error) {
      console.log(error);
      break;
    }
  }
}

function graphMarks(div, sight_settings, v, c, offset, measured) {
  console.log("graphing");
  console.log(sight_settings.sight_scale);
  
  let unit = toScale(document.getElementById("calc_unit").value);

  var data = [];

  for (let i = 1; i <= 120; i += 0.25) {
    try {
      let d = i * unit;

      let [a, vv] = findAngle(v, c, d, 0);
      let m = angleToMark(sight_settings, a, d, 0);
      let actual = m + offset;

      data.push([i, actual]);
    } catch (error) {
      console.log(error);
      break;
    }
  }

  var measuredInUnit = [];
  for (let i = 0; i < measured.length; i++) {
    measuredInUnit.push([measured[i][0] / unit, measured[i][1]]);
    console.log(measured[i]);
  }

  Highcharts.chart(div, {
    title: {
      text: "Sight marks"
    },

    yAxis: {
      title: {
        text: "Mark"
      },
      max: 100 / sight_settings.sight_scale,
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

function readMarks(table, sight_settings) {
  var data = [];

  for (let i = 0; i < table.rows.length; i++) {
    const cells = table.rows[i].cells;
   
    const dist = parseFloat(cells[0].querySelector("input")?.value);
    const mark = parseFloat(cells[1].querySelector("input")?.value);
    const unit = cells[2].querySelector("select")?.value;

    console.log("Have mark for " + dist + unit + " = " + mark);

    if (isNaN(dist)) {
      throw new Error("Invalid input data: distance not a number: " + cells[0].querySelector("input")?.value);
    }

    if (isNaN(mark)) {
      throw new Error("Invalid input data: mark not a number: " + cells[1].querySelector("input")?.value);
    }

    if (mark < 0 || mark > 100 / sight_settings.sight_scale) {
      throw new Error("Invalid input data: mark out of range");
    }

    let scale = toScale(unit);

    data.push([
      dist,
      unit,
      parseFloat(mark)
    ]);
  }

  data.sort((a, b) => a[0] - b[0]);

  return data;
}

function marksToM(marks) {
  var data = [];
  for (let i = 0; i < marks.length; i++) {
    let d = marks[i][0];
    let u = marks[i][1];
    let m = marks[i][2];

    data.push([d * toScale(u), m]);
  }

  return data;
}

function storeValues(sight_settings, marks) {
  console.log("Storing values");

  localStorage.setItem("sight_settings", JSON.stringify(sight_settings));
  localStorage.setItem("marks", JSON.stringify(marks));
}

function readValues() {
  console.log("Reading values");

  try {
    let sight_settings = JSON.parse(localStorage.getItem("sight_settings"));
    let marks = JSON.parse(localStorage.getItem("marks"));

    if (sight_settings != null && marks != null) {
      return [sight_settings, marks];
    } 

  } catch {
    localStorage.removeItem("sight_settings");
    localStorage.removeItem("marks");
  }

  let sight_settings = {
    nock_to_pin: 1020 / 1000,
    nock_to_eye: 110 / 1000,
    tpi: 24,
    sight_scale: 10,
  };

  let marks = [
    [18, 'm', 1.02],
    [30, 'm', 2.43],
    [50, 'm', 4.85],
    [70, 'm', 7.7],
  ];

  storeValues(sight_settings, marks);

  return [sight_settings, marks];
}

var calc_v = 200 / feet_to_m;
var calc_c = 0.03;
var calc_offset = 0;

function calculate() {
  console.log("Recalculating");

  let sight_settings = {
    nock_to_pin: document.getElementById('nock_to_pin').value / 1000,
    nock_to_eye: document.getElementById('nock_to_eye').value / 1000,
    tpi: document.getElementById('sight_tpi').value,
    sight_scale: document.getElementById('sight_scale').value,
  };

  var table = document.getElementById('input_marks');
  let marks = readMarks(table, sight_settings);

  storeValues(sight_settings, marks);

  let data = marksToM(marks);

  let [v, c] = findVelocityAndDrag(sight_settings, data);
  // let [v, c] = [ 200 * feet_to_m, 0.03];

  let [offset, gradient, score] = calcOffset(sight_settings, data, v, c);

  calc_v = v;
  calc_c = c;
  calc_offset = offset;

  let v_fps = v / feet_to_m;
  document.getElementById("velocity").innerText = v_fps.toFixed(3) + " fps";
  document.getElementById("drag").innerText = c.toFixed(5);
  document.getElementById("fit_score").innerText = score.toFixed(5);

  graphMarks("graph", sight_settings, v, c, offset, data, 0);

  let cut_angle = (document.getElementById("cut_angle").value * Math.PI) / 180;

  drawTrajectories(calc_v, calc_c, calc_offset, cut_angle);
  populateMarks(sight_settings, calc_v, calc_c, calc_offset, cut_angle);
}

document.getElementById("calculate").onclick = function() {
  try {
    calculate();
  } catch (error) {
    console.log(error);
  }
};

document.getElementById("calculate_trajectory").onclick = function() {
  try {
    let cut_angle = (document.getElementById("cut_angle").value * Math.PI) / 180;

    let [sight_settings, marks] = readValues();

    drawTrajectories(calc_v, calc_c, calc_offset, cut_angle);
    populateMarks(sight_settings, calc_v, calc_c, calc_offset, cut_angle);

  } catch (error) {
    console.log(error);
  }
};

function setDefaults() {
  let [sight_settings, marks] = readValues();

  console.log("Have sight settings: " + sight_settings);
  console.log("Have marks: " + marks);

  document.getElementById('sight_tpi').value = sight_settings.tpi;
  document.getElementById('sight_scale').value = sight_settings.sight_scale;
  document.getElementById('nock_to_pin').value = sight_settings.nock_to_pin * 1000;
  document.getElementById('nock_to_eye').value = sight_settings.nock_to_eye * 1000;

  var defaultMarks = document.getElementById('input_marks');

  for (let i = 0; i < marks.length; i++) {
    if (i > 0) {
      var clone = defaultMarks.rows[i - 1].cloneNode(true);
      defaultMarks.appendChild(clone);
    }
   
    const cells = defaultMarks.rows[i].cells;
     
    cells[0].querySelector("input").value = marks[i][0];
    cells[2].querySelector("select").value = marks[i][1];
    cells[1].querySelector("input").value = marks[i][2];
  }
}

setDefaults();
calculate();

