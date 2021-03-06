const Sequelize = require("sequelize");
const categoryModel = {
	name: "category",
	define: {
		id: {
			type: Sequelize.UUID,
			primaryKey: true,
			unique: true,
			defaultValue: Sequelize.UUIDV4,
		},
		name: {
			type: Sequelize.STRING,
			allowNull: false,
			unique: true,
		},
		image: {
			type: Sequelize.STRING,
			defaultValue: "https://via.placeholder.com/500",
		},
		description: Sequelize.TEXT,
	},
};
module.exports = categoryModel;
