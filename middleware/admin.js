module.exports = async (req, res, next) => {
  const db = req.app.locals.db;

  const user = await db.collection('users').findOne({ email: req.user.email });

  if (!user || user.role !== 'admin') {
    return res.status(403).json({ message: 'Admins only' });
  }

  next();
};
