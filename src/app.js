import Highcharts from "highcharts";
import { dataPolynomial } from "../src/statistics.js";
import { data } from "../src/data.js";

// Generate the chart
Highcharts.chart("container", {
  title: {
    text: "Sight marks"
  },

  yAxis: {
    title: {
      text: "mark"
    },
    max: 10,
    min: -1
  },

  xAxis: {
    type: "linear",
    title: {
      text: "distance"
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
      name: "Polynomial regression",
      color: "#FF0000",
      type: "line",
      marker: {
        enabled: false
      },
      data: dataPolynomial,
    },
    {
      name: "Measured",
      color: "#808080",
      type: "scatter",
      marker: {
        enabled: true
      },
      data: data
    }
  ]
});
