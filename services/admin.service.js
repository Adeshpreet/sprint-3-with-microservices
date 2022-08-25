const DbService = require("moleculer-db");
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const Admin = require("../models/admin.model");
const Teacher = require("../models/teacher.model");
const Student = require("../models/student.model");
const adminDatabase = require("../databases/adminDatabase");
const express = require("express");
const cookieParser = require("cookie-parser");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
require("dotenv").config();

module.exports = {
  name: "admin",
  mixins: [DbService],
  adapter: new MongooseAdapter(
    process.env.MONGO_URI || "mongodb://localhost/sprint3",
    { useNewUrlParser: true, useUnifiedTopology: true }
  ),
  model: Admin,
  settings: {
    port: 8000,
    use: [cookieParser()],
  },
  actions: {
    seedDatabase() {
      return this.seedDB();
    },
  },
  methods: {
    initRoutes(app) {
      app.post("/signin/admin", this.signin);
      app.patch("/assignteacher", this.assign);
      app.patch("/approve/student", this.approveStudent);
      app.patch("/approve/teacher", this.approveTeacher);
    },
    async mailer(receiverAddress, mailSubject, mailText) {
      let sender = nodemailer.createTransport({
        host: "send.one.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASSWORD,
        },
      });

      sender.sendMail({
        from: '"Adeshpreet Singh" adeshpreet.singh@hestabit.in', // sender address
        to: receiverAddress, // list of receivers
        subject: mailSubject, // Subject line
        text: mailText, // plain text body
        html: mailText, // html body
      });
    },
    async signin(req, res) {
      const fetchedData = await Admin.findOne({
        email: req.body.email,
        password: req.body.password,
      });
      if (fetchedData) {
        res.cookie("userType", "admin");
        res.send(fetchedData.notifications);
      } else {
        res.send("Incorrect Credentials");
      }
    },
    async assign(req, res) {
      if (req.cookies.userType === "admin") {
        const fetchedData = await Student.findOneAndUpdate(
          {
            email: req.body.email,
          },
          {
            assignedTeacher: req.body.assignedTeacher,
            $push: {
              notifications: `Teacher with Email ID - ${req.body.assignedTeacher} has been assigned to you.`,
            },
          }
        );

        await Teacher.findOneAndUpdate(
          { email: req.body.assignedTeacher },
          {
            $push: {
              notifications: `Student with Email ID - ${req.body.email} has been assigned to you.`,
            },
          }
        );

        if (fetchedData) {
          res.send("Teacher Assigned.");
        } else {
          res.send("Student not found.");
        }
      } else res.send("You're not authorized to assign teachers.");
    },
    async approveStudent(req, res) {
      if (req.cookies.userType === "admin") {
        const fetchedData = await Student.findOneAndUpdate(
          { email: req.body.email },
          {
            isApproved: true,
            $push: { notifications: "Admin has approved your join request." },
          }
        );

        const mailSubject = "Join request approval status";
        const mailText = "Admin has approved your join request.";

        if (fetchedData) {
          this.mailer(fetchedData.email, mailSubject, mailText);
          await Admin.updateMany(
            {},
            {
              $push: {
                notifications: `Student with Email ID - ${req.body.email} has been approved.`,
              },
            }
          );
          res.send("Student Approved.");
        } else {
          res.send("Student not found.");
        }
      } else res.send("You're not authorized to approve students.");
    },
    async approveTeacher(req, res) {
      if (req.cookies.userType === "admin") {
        const fetchedData = await Teacher.findOneAndUpdate(
          { email: req.body.email },
          {
            isApproved: true,
            isTeacher: true,
            $push: { notifications: "Admin has approved your join request." },
          }
        );

        const mailSubject = "Join request approval status";
        const mailText = "Admin has approved your join request.";

        if (fetchedData) {
          this.mailer(fetchedData.email, mailSubject, mailText);
          await Admin.updateMany(
            {},
            {
              $push: {
                notifications: `Teacher with Email ID - ${req.body.email} has been approved.`,
              },
            }
          );
          res.send("Teacher Approved.");
        } else {
          res.send("Teacher not found.");
        }
      } else res.send("You're not authorized to approve teachers.");
    },
    async seedDB() {
      this.logger.info("Seeding Admin Database...");
      await Admin.deleteMany({});
      await Admin.insertMany(adminDatabase);
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
    const mailer = async (receiverAddress, mailSubject, mailText) => {
      let sender = nodemailer.createTransport({
        host: "send.one.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASSWORD,
        },
      });

      sender.sendMail({
        from: '"Adeshpreet Singh" adeshpreet.singh@hestabit.in', // sender address
        to: receiverAddress, // list of receivers
        subject: mailSubject, // Subject line
        text: mailText, // plain text body
        html: mailText, // html body
      });
    };
    const dailyMail = async () => {
      this.logger.info(`Daily Mail - List of all unapproved users sent.`);
      const unapprovedStudents = await Student.find({
        isApproved: false,
      });
      const unapprovedTeachers = await Teacher.find({
        isApproved: false,
      });

      const teachers = unapprovedTeachers.map(
        (user) =>
          `Name: ${user.name} | Email: ${user.email} | Needs approval for role: Teacher`
      );
      const students = unapprovedStudents.map(
        (user) =>
          `Name: ${user.name} | Email: ${user.email} | Needs approval for role: Student`
      );
      const final = await teachers.concat(students);
      await mailer(
        "adeshpreet.singh@hestabit.in",
        "Reminder - Users need approval",
        final.toString()
      );
    };

    const task = cron.schedule("0 0 * * *", () => {
      dailyMail();
    });
    task.start();
  },
  stopped() {
    if (this.app.listening) {
      this.app.close((err) => {
        if (err) return this.logger.error("Admin server close error!", err);

        this.logger.info("Admin server stopped!");
      });
    }
  },
};
