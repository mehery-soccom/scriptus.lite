const mongon = require("@bootloader/mongon");

const KnowBaseSchema = mongon.Schema(
  {
    code: {
      type: String,
      index: true,
    },
    idNumber: {
      type: Number,
    },
    parentId: {
      type: String,
      index: true,
    },
    type: {
      type: String,
      index: true,
    },
    title: {
      type: String,
    },
    category: {
      type: String,
    },
    startnote: {
      type: String,
    },
    content: {
      type: String,
    },
    endnote: {
      type: String,
    },
  },
  {
    timestamps: true, // Assuming TimeStampDoc maps to @CreatedDate/@LastModifiedDate in Java
    collection: "DICT_KNOW_BASE",
  }
);

module.exports = { KnowBaseSchema };
