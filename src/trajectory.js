import regression from "regression";
import Highcharts from "highcharts";

let radian = Math.PI / 180;
let feet_to_m = 0.3048;
let yard_to_m = 0.9144;

let g = 9.80665;

let y_error = 0.001;
let y_estimate_error = 0.1;
let x_estimate_error = 0.5;
let v_error = 0.1 * feet_to_m;
let c_error = 0.000001;
let calc_min_t_step = 0.00001;
let calc_steps = 500;
let tries = 100;

let absolute_minimum_v = 25 * feet_to_m;
let absolute_c_max = 0.3;

let angle_estimate_range = 45;
let angle_range = 5;

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
function angleToMark(sight_settings, sight_bar_position, a, d, cut_angle) {
  let [x_target, y_target] = cutDists(d, cut_angle);

  let eye_x = Math.sin(a) * sight_settings.arrow_to_eye + x_target;
  let eye_y = Math.cos(a) * sight_settings.arrow_to_eye - y_target;
  let o = Math.atan(eye_y / eye_x);
 
  let eye_to_sight = sight_settings.eye_to_sight - 
    (sight_bar_position - sight_settings.sight_bar_position) * sight_settings.sight_bar_spacing;
 
  let m = Math.tan(a + o) * eye_to_sight;
  
  let mm_per_turns = 25.4 / sight_settings.vertical_tpi;
  let mark = m * 1000 / mm_per_turns / sight_settings.sight_scale;

  return mark;
}

function markAtDistance(d, m, sight_settings, sight_bar_position) {
  let eye_to_sight = sight_settings.eye_to_sight - 
    (sight_bar_position - sight_settings.sight_bar_position) * sight_settings.sight_bar_spacing;
 
  let a = Math.atan(m / 1000 / eye_to_sight);
  let r =  Math.tan(a) * d;

  return r;
}

function roundToClick(sight_settings, num) {
  let click = (1.0 / sight_settings.sight_scale) / sight_settings.clicks_per_turn;

  const decimalPart = click.toString().split(".")[1];
  const decimals = decimalPart ? decimalPart.length : 0;

  return (Math.round(num / click) * click).toFixed(decimals);
}

function calc(v, c, a, d, f) {
  // console.log(`calc path ${d} ${(v / feet_to_m).toFixed(2)} ${c.toFixed(4)} ${(a / radian).toFixed(3)}`);

  let m = 0.0221;
  var t = 0;
  var x = 0;
  var y = 0;
  var vx = v * Math.cos(a);
  var vy = v * Math.sin(a);

  while (x < d) {
    var step = Math.max(calc_min_t_step, (d - x) / calc_steps / vx);

    t += step;
    x += vx * step;
    y += vy * step;

    if (!f([x, y, vx, vy, t])) {
      break;
    }

    let v = Math.sqrt(vx * vx + vy * vy);

    // let ax = (-c * v * vx) / m;
    // let ay = (-c * v * vy - (g * m)) / m;
    let ax = -c * v * vx;
    let ay = -c * v * vy - g;

    vx += ax * step;
    vy += ay * step;
   
    if (v < absolute_minimum_v || vx < 1 * feet_to_m) {
      throw new Error(`Failed to calc path ${d} ${(v / feet_to_m).toFixed(2)} ${c.toFixed(4)} ${(a / radian).toFixed(3)}: vx too low`);
    }
  }
}

function estimateT(v, a, x) {
  return x / (v * Math.cos(a));
}

function estimateImpact(v, c, a, d) {
  // console.log(`estimate impact ${d} ${(v / feet_to_m).toFixed(2)} ${c.toFixed(4)} ${(a / radian).toFixed(3)}`);

  let t_guess = estimateT(v, a, d);

  var t_max = t_guess * 1.2;
  var t_min = t_guess * 0.8;
  var t = t_guess;
  for (let j = 0; j < tries; j++) {
    let vv = v * Math.pow(Math.E, -c * t);
    let x = (vv * t * Math.cos(a));
    let y = (vv * t * Math.sin(a)) - (0.5 * g * Math.pow(t,2)); 

    if (Math.abs(x - d) < x_estimate_error) {
      return y;
    } else if (t_min == t_max) {
      throw new Error(`Failed to find estimate for impact: ${d} narrowed to zero range`);
    } else if (x < d) {
      t_min = t;
    } else {
      t_max = t;
    }
      
    t = t_min + (t_max - t_min) / 2;
  }

  throw new Error(`Failed to estimate imapct for distance: ${d} exceeded max tries`);
}

function estimateAngle(v, c, d, cut_angle) {
  // console.log(`estimate angle ${d} ${(v / feet_to_m).toFixed(2)} ${c.toFixed(4)} ${cut_angle / radian}`);

  var a = cut_angle;
  var a_min = Math.max(a - angle_estimate_range * radian, -90 * radian);
  var a_max = Math.min(a + angle_estimate_range * radian, 90 * radian);

  let [x_target, y_target] = cutDists(d, cut_angle);

  for (let i = 0; i < tries; i++) {
    let y = estimateImpact(v, c, a, x_target);

    if (Math.abs(y - y_target) < y_estimate_error) {
      return a;
    } else if (a_min == a_max) {
      throw new Error(`Failed to find estimate for distance: ${d} narrowed to zero range`);
    } else if (y < y_target) {
      a_min = a;
    } else {
      a_max = a;
    }
      
    a = a_min + (a_max - a_min) / 2;
  }

  throw new Error(`Failed to estimate angle for distance: ${d} exceeded max tries`);
}

function findImpact(v, c, a, d) {
  // console.log(`find impact ${d} ${(v / feet_to_m).toFixed(2)} ${c.toFixed(4)} ${(a / radian).toFixed(3)}`);

  var end = [];
  let f = function(p) {
    end = p;
    return true;
  };
  
  calc(v, c, a, d, f);
  let [x, y, vx, vy, t] = end;
  let vv = Math.sqrt(vx*vx + vy*vy);
  return [y, vv, t];
}

function findAngle(v, c, d, cut_angle, a_guess) {
  // console.log(`find angle ${d} ${(v / feet_to_m).toFixed(2)} ${c.toFixed(4)} ${cut_angle / radian}`);

  var a = a_guess;
  var a_min = a - angle_range * radian;
  var a_max = a + angle_range * radian;

  let [x_target, y_target] = cutDists(d, cut_angle);

  for (let i = 0; i < tries; i++) {
    let [y, vv, t] = findImpact(v, c, a, x_target);

    if (Math.abs(y - y_target) < y_error) {
      return a;
    } else if (a_min == a_max) {
      throw new Error(`Failed to find angle for distance: ${d} narrowed to zero range`);
    } else if (y < y_target) {
      a_min = a;
    } else {
      a_max = a;
    }
      
    a = a_min + (a_max - a_min) / 2;
  }

  throw new Error(`Failed to find angle for distance: ${d} exceeded max tries`);
}

function calcOffset(sight_settings, data, v, c) {
  console.log(`calc offset ${(v / feet_to_m).toFixed(3)} ${c.toFixed(4)}`);

  var errors = [];
  for (let i = 0; i < data.length; i++) {
    let [d, m, s] = data[i];
    var a_guess = estimateAngle(v, c, d, 0);
    let a = findAngle(v, c, d, 0, a_guess);
    let m_calc = angleToMark(sight_settings, s, a, d, 0);
    let diff = m - m_calc;
   
    errors.push([d, diff]);
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

function findVelocity(sight_settings, data, c, v_min, v_max) {
  console.log(`FIND VELOCITY ${c.toFixed(4)}`);

  for (let i = 0; i < tries; i++) {
    let v = v_min + (v_max - v_min) / 2;

    try {
      let [offset, gradient, score] = calcOffset(sight_settings, data, v, c);

      if (v_max - v_min < v_error) {
        return v;
      } else if (gradient < 0) {
        v_min = v;
      } else {
        v_max = v;
      }

    } catch (error) {
      console.log(error);

      if (v_max - v_min < v_error) {
        throw new Error(`Failed to find velocity for c = ${c.toFixed(4)} : narrowed without finding`);
      }

      v_min = v;
    }
  }

  throw new Error(`Failed to find velocity for c = ${c.toFixed(4)} : exceeded max tries`);
}

function findVelocityAndDrag(sight_settings, data) {
  console.log("FIND VELOCITY AND DRAG");

  var c_best = 0.005;

  var v_best = findVelocity(sight_settings, data, c_best, 
      100 * feet_to_m, 
      350 * feet_to_m);

  if (data.length < 3) {
    console.log("Not enought data points for proper drag calculation");
    return [v_best, c_best];
  }

  let error_best = 1000;
  let c_min = 0.0001;
  let c_max = absolute_c_max;

  while (c_max - c_min > c_error) {
    let c_step = (c_max - c_min) / 10;

    for (let c = c_min; c < c_max; c += c_step) {
      try {
        let v = findVelocity(sight_settings, data, c, v_best * 0.8, v_best * 1.2);

        let [offset, gradient, score] = calcOffset(sight_settings, data, v, c);

        let error = score 
        if (error < error_best) {
          error_best = error;
          v_best = v;
          c_best = c;
        }

      } catch (error) {
        console.log(error);
        break;
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

  var a_guess = estimateAngle(v, c, d, cut_angle);
  let a = findAngle(v, c, d, cut_angle, a_guess);

  let f = function (p) {
    let y = p[1];
    if (y >= max) {
      max = y;
      return true;
    } else {
      return false;
    }
  }

  let [x_target, y_target] = cutDists(d, cut_angle);

  calc(v, c, a, x_target, f);

  return max;
}

function drawTrajectory(ctx, x_scale, y_scale, launch_x, launch_y, unit, h, v, c, d, cut_angle) {
  let [x_target, y_target] = cutDists(d * unit, cut_angle);
  
  ctx.beginPath();
  ctx.moveTo(launch_x, launch_y);

  let f = function (p) {
    let x = p[0];
    let y = p[1];

    ctx.lineTo(launch_x + x * x_scale, launch_y - y * y_scale);

    return true;
  }

  var a_guess = estimateAngle(v, c, d * unit, cut_angle);
  let a = findAngle(v, c, d * unit, cut_angle, a_guess);

  console.log(`Draw trajectory ${d} with angle ${(a/radian).toFixed(3)}`);

  calc(v, c, a, x_target, f);
  
  ctx.stroke();

  const target = new Path2D();
  target.rect(launch_x + x_target * x_scale, launch_y - h/2 - y_target * y_scale, 5, h);

  ctx.stroke(target);

  ctx.fillText(d + toUnitName(unit), launch_x + x_target * x_scale, launch_y + h/2 + 5 - y_target * y_scale);
}

function drawTrajectories(v, c, offset, cut_angle, unit, dists) {
  console.log("Draw trajectories");

  const canvas = document.getElementById("trajectory_canvas");

  var max_x = 0;
  var max_y = 0;
  var min_y = 0;

  for (let i = dists.length - 1; i >= 0; i--) {
    try {
      let x = dists[i] * unit;
      max_y = maxHeight(v, c, x, cut_angle);
      let [x_target, y_target] = cutDists(x, cut_angle);
      max_x = x_target;
      min_y = Math.min(0, y_target);
      console.log(`Found max dist ${x} target at ${max_x}, max y ${max_y}, min y ${min_y}`);
      break;
    } catch (error) {
      console.log("Failed to get max height for " + dists[i] + " : " + error);
    }
  }

  var rect = canvas.parentNode.getBoundingClientRect();
  
  let x_scale = rect.width / (max_x + 10);
  let y_scale = 30;

  canvas.width = rect.width;
  canvas.height = (2 + max_y - min_y) * y_scale + 100;

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

    ctx.fillText(y + toUnitName(unit), 
        launch_x - 10, 
        launch_y - y * unit * y_scale);
  }

  if (cut_angle != 0) {
    for (let x = 0; x * unit < max_x; x += 5) {
      ctx.fillText(x + toUnitName(unit), 
          launch_x + x * unit * x_scale,
          launch_y);
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < dists.length; i++) {
    let d = dists[i];
    let [x_target, y_target] = cutDists(d * unit, cut_angle);
    if (x_target > max_x) continue;

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

function calculateMark(sight_settings, sight_bar_position, v, c, offset, cut_angle, d, a_guess) {
  let a = findAngle(v, c, d, cut_angle, a_guess);

  let m = angleToMark(sight_settings, sight_bar_position, a, d, cut_angle) + offset;

  let [x_target, y_target] = cutDists(d, cut_angle);

  let [y, vv, t] = findImpact(v, c, a, x_target);
 
  let impactBefore = findImpact(v, c, a, x_target - 0.5)[0];
  let impactAfter = findImpact(v, c, a, x_target + 0.5)[0];
  let drop = impactBefore - impactAfter;

  let verticalMarks = markAtDistance(d, 25.4 / sight_settings.vertical_tpi, 
      sight_settings, sight_bar_position) * 100;
  let horizontalMarks = markAtDistance(d, 25.4 / sight_settings.horizontal_tpi, 
      sight_settings, sight_bar_position) * 100;

  return [m, a, vv / feet_to_m, t, drop * 100, verticalMarks, horizontalMarks];
}

function populateMarks(sight_settings, v, c, offset, cut_angle, unit) {
  console.log(`Populate marks ${v.toFixed(1)} ${c.toFixed(5)} cut ${cut_angle/radian}`);
  
  var table = document.getElementById('marks');

  table.innerHTML = "";

  var a_guess = estimateAngle(v, c, 1 * unit, cut_angle);

  for (let i = 2; i <= 120; i += 1) {
    try {
      let [m, a, fps, t, drop, verticalMarks, horizontalMarks] = 
          calculateMark(sight_settings, sight_settings.sight_bar_position, v, c, offset, 
            cut_angle, i * unit, a_guess);

      a_guess = a;

      let cells = [
        document.createTextNode(i.toString() + toUnitName(unit)),
        document.createTextNode(roundToClick(sight_settings, m)),
        document.createTextNode(fps.toFixed(1) + " fps"),
        document.createTextNode(t.toFixed(3) + " s"),
        document.createTextNode(drop.toFixed(1) + " cm"),
        document.createTextNode(verticalMarks.toFixed(2) + " cm"),
        document.createTextNode(horizontalMarks.toFixed(2) + " cm")];

      var newRow = table.insertRow(table.rows.length);

      for (let cell = 0; cell < cells.length; cell++) {
        var newCell = newRow.insertCell(cell);
        newCell.appendChild(cells[cell]);
      }

    } catch (error) {
      console.log(error);
      break;
    }
  }
}

function graphMarks(div, sight_settings, v, c, offset, cut_angle, unit, measured) {
  console.log("Graphing");

  var data = [];

  var a_guess = estimateAngle(v, c, 1 * unit, cut_angle);

  var max_mark = 100 / sight_settings.sight_scale;
  for (let i = 0; i < measured.length; i++) {
    if (measured[i][1] > max_mark) {
      max_mark = measured[i][1];
    }
  }

  for (let i = 1; i <= 1000; i += 0.25) {
    try {
      let d = i * unit;

      if (d > 150) {
        break;
      }

      let a = findAngle(v, c, d, cut_angle, a_guess);
      a_guess = a;

      let m = angleToMark(sight_settings, sight_settings.sight_bar_position, a, d, cut_angle);
      let actual = m + offset;

      console.log(`${d} = ${m} / ${actual}`);

      if (d > measured[measured.length-1][0] + 10 && actual > max_mark) {
        break;
      }

      data.push([i, actual]);
    } catch (error) {
      console.log(error);
      break;
    }
  }

  var measuredInUnit = [];

  if (cut_angle == 0) {
    for (let i = 0; i < measured.length; i++) {
      let d = measured[i][0] / unit;
      let m = measured[i][1];
      let s = measured[i][2];

      if (s != sight_settings.sight_bar_position) {
        console.log(`skipping plotting measured mark as the sight bar isn't in the default position ${d} = ${m} at ${s}`);
        continue;
      }

      measuredInUnit.push([d, m]);
    }
  }

  Highcharts.chart(div, {
    title: {
      text: "Sight marks"
    },

    yAxis: {
      title: {
        text: "Mark"
      },
      max: max_mark,
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
    const sight_bar = parseFloat(cells[2].querySelector("input")?.value);
    const unit = cells[3].querySelector("select")?.value;

    console.log(`Have mark for ${dist} ${unit} = ${mark} with sight bar at ${sight_bar}`);

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
      parseFloat(mark),
      sight_bar
    ]);
  }

  data.sort((a, b) => a[0] - b[0]);

  return data;
}

function marksToM(sight_settings, marks) {
  var data = [];
  for (let i = 0; i < marks.length; i++) {
    let d = marks[i][0];
    let u = marks[i][1];
    let m = marks[i][2];
    let s = marks[i][3];

    data.push([d * toScale(u), m, s]);
  }

  return data;
}

var sight_settings = {
  eye_to_sight: 1020 / 1000,
  arrow_to_eye: 110 / 1000,
  vertical_tpi: 24,
  horizontal_tpi: 32,
  sight_scale: 10,
  clicks_per_turn: 20,
  sight_bar_spacing: 12.7 / 1000,
  sight_bar_position: 1,
};

var marks = [
  [18, 'm', 1.02, 1],
  [30, 'm', 2.43, 1],
  [50, 'm', 4.85, 1],
  [70, 'm', 7.7, 1],
];

var calculated = false;
var calc_v = 200 / feet_to_m;
var calc_c = 0.03;
var calc_offset = 0;

function storeValues() {
  console.log("Storing values");

  localStorage.setItem("sight_settings", JSON.stringify(sight_settings));
  localStorage.setItem("marks", JSON.stringify(marks));
}

function readStored() {
  console.log("Reading values");

  try {
    let new_sight_settings = JSON.parse(localStorage.getItem("sight_settings"));
    let new_marks = JSON.parse(localStorage.getItem("marks"));

    if (new_sight_settings == null) {
      throw new Error("No sight settings");
    } else if (new_marks == null) {
      throw new Error("No marks");
    } else if (new_sight_settings.eye_to_sight == 0 ||
               new_sight_settings.arrow_to_eye == 0 ||
               new_sight_settings.vertical_tpi == 0 ||
               new_sight_settings.horizontal_tpi == 0 ||
               new_sight_settings.clicks_per_turn == 0 ||
               new_sight_settings.sight_bar_position == 0 ||
               new_sight_settings.sight_scale == 0) {
      throw new Error("Sight settings invalid");
    } else if (!Array.isArray(new_marks)) {
      throw new Error("Marks are invalid");
    }

    sight_settings = new_sight_settings;
    marks = new_marks;

  } catch (error) {
    console.log("Error reading sight settings or marks: " + error);

    localStorage.removeItem("sight_settings");
    localStorage.removeItem("marks");
  }

  storeValues(sight_settings, marks);
}

function readValues() {
  readStored();

  sight_settings = {
    eye_to_sight: document.getElementById('eye_to_sight').value / 1000,
    arrow_to_eye: document.getElementById('arrow_to_eye').value / 1000,
    vertical_tpi: document.getElementById('sight_tpi_vertical').value,
    horizontal_tpi: document.getElementById('sight_tpi_horizontal').value,
    sight_scale: document.getElementById('sight_scale').value,
    sight_bar_spacing: document.getElementById('sight_bar_spacing').value / 1000,
    sight_bar_position: document.getElementById('sight_bar_position').value,
    clicks_per_turn: document.getElementById('sight_clicks_per_turn').value,
  };

  var table = document.getElementById('input_marks');
  
  marks = readMarks(table, sight_settings);

  storeValues();
}

function updateMark() {
  var out_mark = "Unknown";
  var out_fps = "Unknown";
  var out_t = "Unknown";
  var out_drop = "Unknown";
  var out_vert = "Unknown";
  var out_horz = "Unknown";

  try {
    console.log("calculating mark");

    let d = document.getElementById("calc_mark_dist").value;
    let unit = toScale(document.getElementById("calc_mark_unit").value);
    let cut_angle = document.getElementById("calc_mark_cut").value * -radian;
    let sight_bar = document.getElementById("calc_mark_sight_bar").value;

    var a_guess = estimateAngle(calc_v, calc_c, d * unit, cut_angle);

    let [m, a, fps, t, drop, verticalMarks, horizontalMarks] = calculateMark(sight_settings, sight_bar,
      calc_v, calc_c, calc_offset, cut_angle, d * unit, a_guess);

    console.log(`calculating mark ${d} = ${m}`);

    out_mark = roundToClick(sight_settings, m);
    out_fps = fps.toFixed(1) + " fps";
    out_t = t.toFixed(3) + " s";
    out_drop = drop.toFixed(1) + " cm";
    out_vert = verticalMarks.toFixed(2) + " cm";
    out_horz = horizontalMarks.toFixed(2) + " cm";

    console.log("Updated mark");

  } catch (error) {
    console.log(error);
  }


  document.getElementById("calc_mark_output_mark").value = out_mark;
  document.getElementById("calc_mark_output_v").value = out_fps;
  document.getElementById("calc_mark_output_t").value = out_t;
  document.getElementById("calc_mark_output_drop").value = out_drop;
  document.getElementById("calc_mark_output_vertical_turn").value = out_vert;
  document.getElementById("calc_mark_output_horizontal_turn").value = out_horz;
}

function updateMarks() {
  try {
    console.log("calculating marks");

    let unit = toScale(document.getElementById("calc_unit").value);
    let cut_angle = document.getElementById("cut_angle").value * -radian;

    populateMarks(sight_settings, calc_v, calc_c, calc_offset, cut_angle, unit);

    let dists = document.getElementById("trajectory_dists").value.split(/\s*,\s*/).map(Number);
    drawTrajectories(calc_v, calc_c, calc_offset, cut_angle, unit, dists);

    console.log("Updated marks");

  } catch (error) {
    console.log(error);
  }
}

function updateGraph() {
  try {
    console.log("graph marks");

    let unit = toScale(document.getElementById("graph_unit").value);
    let cut_angle = 0; //document.getElementById("cut_angle").value * radian;

    let data = marksToM(sight_settings, marks);

    graphMarks("graph", sight_settings, calc_v, calc_c, calc_offset, cut_angle, unit, data);

    console.log("Updated graph");

  } catch (error) {
    console.log(error);
  }
}

function calculate() {
  console.log("Calculating");

  readValues();

  let data = marksToM(sight_settings, marks);

  let [v, c] = findVelocityAndDrag(sight_settings, data);

  let [offset, gradient, score] = calcOffset(sight_settings, data, v, c);

  calc_v = v;
  calc_c = c;
  calc_offset = offset;
  calculated = true;

  let v_fps = v / feet_to_m;
  document.getElementById("velocity").value = v_fps.toFixed(1) + " fps";
  document.getElementById("drag").value = c.toFixed(5);
  document.getElementById("fit_score").value = score.toFixed(5);
}

function updateEverything() {
  calculate();

  updateGraph();
  updateMark();
  updateMarks();
}

function maybeUpdateEverything() {
  let old_sight_settings = sight_settings;
  let old_marks = marks;

  readValues();

  if (!calculated ||
      JSON.stringify(old_sight_settings) != JSON.stringify(sight_settings) ||
      JSON.stringify(old_marks) != JSON.stringify(marks)) {
    console.log("Input values changed, recalculating");
    updateEverything();
    return true;
  } else {
    return false;
  }
}

document.getElementById("calculate").onclick = function() {
  try {
    updateEverything();
  } catch (error) {
    console.log(error);
  }
};

document.getElementById("calculate_trajectory_and_marks").onclick = function() {
  try {
    if (maybeUpdateEverything()) {
      return;
    }

    updateMarks();

  } catch (error) {
    console.log(error);
  }
};


document.getElementById("calc_unit").onchange = function() {
  try {
    if (maybeUpdateEverything()) {
      return;
    }

    updateMarks();

  } catch (error) {
    console.log(error);
  }
}

document.getElementById("graph_unit").onchange = function() {
  try {
    if (maybeUpdateEverything()) {
      return;
    }

    updateGraph();
  } catch (error) {
    console.log(error);
  }
}

document.getElementById("calculate_mark").onclick = function() {
  try {
    if (maybeUpdateEverything()) {
      return;
    }
  } catch (error) {
    console.log(error);
  }

  updateMark();
};

function setDefaults() {
  readStored();

  document.getElementById('sight_tpi_vertical').value = sight_settings.vertical_tpi;
  document.getElementById('sight_tpi_horizontal').value = sight_settings.horizontal_tpi;
  document.getElementById('sight_scale').value = sight_settings.sight_scale;
  document.getElementById('eye_to_sight').value = sight_settings.eye_to_sight * 1000;
  document.getElementById('arrow_to_eye').value = sight_settings.arrow_to_eye * 1000;
  document.getElementById('sight_bar_spacing').value = sight_settings.sight_bar_spacing * 1000;
  document.getElementById('sight_bar_position').value = sight_settings.sight_bar_position;
  document.getElementById('sight_clicks_per_turn').value = sight_settings.clicks_per_turn;

  var defaultMarks = document.getElementById('input_marks');

  for (let i = 0; i < marks.length; i++) {
    if (i > 0) {
      var clone = defaultMarks.rows[i - 1].cloneNode(true);
      defaultMarks.appendChild(clone);
    }
   
    const cells = defaultMarks.rows[i].cells;
     
    cells[0].querySelector("input").value = marks[i][0];
    cells[1].querySelector("input").value = marks[i][2];
    cells[2].querySelector("input").value = marks[i][3];
    cells[3].querySelector("select").value = marks[i][1];
  }
}

setDefaults();
// calculate();

