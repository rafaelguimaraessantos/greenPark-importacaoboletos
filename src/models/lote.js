const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Lote = sequelize.define('Lote', {
  nome: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  criado_em: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'lotes',
  timestamps: false
});

module.exports = Lote;
