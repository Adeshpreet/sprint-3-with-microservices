const DbService = require("moleculer-db");
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const Admin = require("../models/admin.model");
const Student = require("../models/student.model");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = {
  name: "student",
  mixins: [DbService],
  adapter: new MongooseAdapter(
    process.env.MONGO_URI || "mongodb://localhost/sprint3",
    { useNewUrlParser: true, useUnifiedTopology: true }
  ),
  model: Student,
  settings: {
    port: 8001,
    use: [cookieParser()],
  },
  actions: {},
  methods: {
    initRoutes(app) {
      app.post("/signin/student", this.signin);
      app.post("/signup/student", this.signup);
      app.get("/student", this.get);
      app.patch("/edit/student", this.edit);
      app.delete("/delete/student", this.delete);
    },

    async signin(req, res) {
      try {
        const fetchedData = await Student.findOne({
          email: req.body.email,
          password: req.body.password,
        });
        let jwtSecretKey = process.env.JWT_SECRET_KEY;
        let data = {
          id: fetchedData._id,
        };
        const token = jwt.sign(data, jwtSecretKey);

        if (fetchedData) {
          res.cookie("userType", "student");
          res.cookie("token", token);
          res.cookie("id", fetchedData._id);
          res.send(fetchedData.notifications);
        } else {
          res.send("Incorrect Credentials.");
        }
      } catch (error) {
        res.send("User not found");
      }
    },
    async signup(req, res) {
      const newStudent = new Student({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        address: req.body.address,
        profilePicture: req.body.profilePicture,
        currentSchool: req.body.currentSchool,
        previousSchool: req.body.previousSchool,
        assignedTeacher: req.body.assignedTeacher,
        parentsDetails: {
          fathersName: req.body.parentsDetails.fathersName,
          mothersName: req.body.parentsDetails.mothersName,
        },
      });

      await Admin.updateMany(
        {},
        {
          $push: {
            notifications: `A new student - ${req.body.name} has joined with Email ID - ${req.body.email} and requires approval.`,
          },
        }
      );

      newStudent.save(function (err, result) {
        if (err) {
          res.send(err);
        } else {
          res.send(result);
        }
      });
    },
    async get(req, res) {
      if (req.cookies.userType === "student") {
        const fetchedData = await Student.findOne({
          _id: req.cookies.id,
        });

        if (fetchedData) {
          res.send(fetchedData);
        } else {
          res.send("Unable to retrieve data.");
        }
      } else res.send("Unable to verify user ownership, Please contact admin.");
    },
    async edit(req, res) {
      if (req.cookies.userType === "student") {
        const fetchedData = await Student.findOneAndUpdate(
          { _id: req.cookies.id },
          req.body
        );
        if (fetchedData) {
          res.send("Edit Done.");
        } else {
          res.send("Server Error.");
        }
      } else if (req.cookies.userType === "admin") {
        const fetchedData = await Student.findOneAndUpdate(
          { email: req.body.email },
          req.body
        );
        if (fetchedData) {
          res.send("Edit Done.");
        } else {
          res.send("Server Error.");
        }
      } else
        res.send("Unable to edit details. Make sure you're approved by admin.");
    },
    async delete(req, res) {
      if (req.cookies.userType === "student") {
        const fetchedData = await Student.findOneAndDelete({
          _id: req.cookies.id,
        });
        if (fetchedData) {
          res.send("Student Deleted.");
        } else {
          res.send("Server error, Please try again later.");
        }
      } else res.send("You are not authorized to delete this user.");
    },
  },
  created() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    this.initRoutes(app);
    this.app = app;
  },
  started() {
    this.app.listen(Number(this.settings.port), (err) => {
      if (err) this.broker.fatal(err);
      this.logger.info(
        `Server started on port http://localhost:${this.settings.port}`
      );
    });
  },
  stopped() {
    if (this.app.listening) {
      this.app.close((err) => {
        if (err) return this.logger.error("Student server close error!", err);
        this.logger.info("Student server stopped!");
      });
    }
  },
};
