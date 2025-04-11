# greenPark-importacaoboletos
Este projeto é uma API construída com Node.js, Express, Sequelize e MySQL

#  Projeto de Importação e Processamento de Boletos

Este projeto é uma API construída com **Node.js**, **Express**, **Sequelize** e **MySQL** para:

-  Importar boletos via arquivos CSV.
-  Mapear os boletos para lotes de unidades específicas.
-  Processar arquivos PDF com os boletos e gerar arquivos separados por nome/sacado.
-  Armazenar informações no banco de dados com verificação de duplicidade.
-  Organizar e salvar os PDFs automaticamente por ordem definida.

---

##  Tecnologias Utilizadas

- **Node.js**
- **Express**
- **Sequelize ORM**
- **MySQL (via MySQL Workbench)**
- **Multer** (upload de arquivos)
- **csv-parser** (leitura de CSV)
- **pdf-lib** & **pdf-parse** (manipulação de PDF)
- **Docker (opcional, para deploy)**

---

##  Pré-requisitos

- Node.js v14 ou superior
- MySQL Server
- (Opcional) Docker
- MySQL Workbench para administrar o banco

---
## Informações
- para salvar na pasta desejada como estou usando WSL, na config do docker eu
- fiz a seguinte config no arquivo docker-compose.yml
-volumes:
- .:/usr/src/app
- /mnt/c/Users/rafae/OneDrive/Documentos/pdfBoletos:/usr/src/app/src/pdfs
- a pasta de collections com os endpoints estão na raiz do projeto junto com os arquivos que foram usados para teste a pasta se chama "pastaarquivostestenode"
---      
##  Instalação

```bash
git clone https://github.com/seu-usuario/seu-repo.git
cd seu-repo
npm install
npm install --save-dev nodemon 
npm install multer csv-parser pdf-parse pdf-lib 
