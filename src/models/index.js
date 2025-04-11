const { Sequelize, DataTypes } = require('sequelize');

// Configuração do Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    port: 3306,
  }
);

// Definição dos modelos
const Lote = sequelize.define('Lote', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    autoIncrement: true
  },
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

// Definindo as associações
Boleto.belongsTo(Lote, { foreignKey: 'id_lote' });

// Função para conectar e sincronizar
const connect = async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexão com o banco de dados bem-sucedida!');
    
    await sequelize.sync({ force: false });
    console.log('Modelos sincronizados!');
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', error);
  }
};

// Exportando tudo o que será necessário
module.exports = {
  connect,
  sequelize,
  Lote,
  Boleto
};