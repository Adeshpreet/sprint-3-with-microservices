const DbService = require("moleculer-db");
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const Teacher = require("../models/teacher.model");
const Admin = require("../models/admin.model");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = {
  name: "teacher",
  mixins: [DbService],
  adapter: new MongooseAdapter(
    process.env.MONGO_URI || "mongodb://localhost/sprint3",
    { useNewUrlParser: true, useUnifiedTopology: true }
  ),
  model: Teacher,
  settings: {
    port: 8002,
    use: [cookieParser()],
  },
  actions: {},
  methods: {
    initRoutes(app) {
      app.post("/signin/teacher", this.signin);
      app.post("/signup/teacher", this.signup);
      app.get("/teacher", this.get);
      app.patch("/edit/teacher", this.edit);
      app.delete("/delete/teacher", this.delete);
    },

    async signin(req, res) {
      try {
        const fetchedData = await Teacher.findOne({
          email: req.body.email,
          password: req.body.password,
        });
        let jwtSecretKey = process.env.JWT_SECRET_KEY;
        let data = {
          id: fetchedData._id,
        };
        const token = jwt.sign(data, jwtSecretKey);
        if (fetchedData) {
          res.cookie("id", fetchedData._id);
          res.cookie("token", token);
          if (fetchedData.isTeacher === true) {
            res.cookie("userType", "teacher");
          }
          res.send(fetchedData.notifications);
        } else {
          res.send("Incorrect Credentials.");
        }
      } catch (error) {
        res.send("User not found.");
      }
    },
    async signup(req, res) {
      const newTeacher = new Teacher({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        address: req.body.address,
        profilePicture: req.body.profilePicture,
        currentSchool: req.body.currentSchool,
        previousSchool: req.body.previousSchool,
        experience: req.body.experience,
        expertiseInSubjects: req.body.expertiseInSubjects,
      });

      await Admin.updateMany(
        {},
        {
          $push: {
            notifications: `A new teacher - ${req.body.name} has joined with Email ID - ${req.body.email} and requires approval.`,
          },
        }
      );

      newTeacher.save(function (err, result) {
        if (err) {
          res.send(err);
        } else {
          res.send(result);
        }
      });
    },
    async get(req, res) {
      if (req.cookies.userType === "teacher") {
        const fetchedData = await Teacher.findOne({
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
      if (req.cookies.userType === "teacher") {
        const fetchedData = await Teacher.findOneAndUpdate(
          { _id: req.cookies.id },
          req.body
        );

        if (fetchedData) {
          res.send(fetchedData);
        } else {
          res.send("Unable to retrieve data.");
        }
      } else res.send("Unable to verify user ownership, Please contact admin.");
    },
    async delete(req, res) {
      if (req.cookies.userType === "teacher" || "admin") {
        const fetchedData = await Teacher.findOneAndDelete({
          _id: req.cookies.id,
        });
        if (fetchedData) {
          res.send("Teacher Deleted.");
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
        if (err) return this.logger.error("Teacher server close error!", err);

        this.logger.info("Teacher server stopped!");
      });
    }
  },
};
