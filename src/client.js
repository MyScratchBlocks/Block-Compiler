const express = require('express');
const router = express.Router();

let users = [];
router.use(express.json());

router.post('/api/join', (req, res) => {
  const { username, password, img, email } = req.body;
  if (req.headers.Authorization === process.env.AUTH_CODE) {
    // Creating user object
    const user = { 
      username: username,
      password: password,
      "image-link": img,
      email: email
    };
    // Adding user to the array
    users.push(user);
    res.json({ message: "User registered successfully" });
  } else {
    res.status(401).json({ message: "Invalid Auth Key" });
  }
});

router.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    res.json({ message: "Logged In" });
  } else {
    res.status(401).json({ message: "Invalid Password Or Username" });
  }
});

module.exports = router;
