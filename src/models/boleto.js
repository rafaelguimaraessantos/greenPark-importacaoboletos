const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Lote = require('./lote');

const Boleto = sequelize.define('Boleto', {
  nome_sacado: {
    type: DataTypes.STRING,
    allowNull: false
  },
  valor: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  linha_digitavel: {
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
  tableName: 'boletos',
  timestamps: false
});

Boleto.belongsTo(Lote, { foreignKey: 'id_lote' });

module.exports = Boleto;
