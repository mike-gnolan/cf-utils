const _chai = require("chai");
const expect = _chai.expect;
const rewire = require("rewire");
const { mockClient } = require("aws-sdk-client-mock");
const { mockConfig, mockS3 } = require("./stubs");
const {
  EC2Client,
  CreateKeyPairCommand,
  DeleteKeyPairCommand
} = require('@aws-sdk/client-ec2');

// Rewire
const keypair = rewire("../src/keypair");

// keypair Tests
describe("src/keypair", () => {
  let stubs = [];

  // Mock keypair Client
  let keypairMock;

  beforeEach(() => {
    // Mock client
    keypairMock = mockClient(EC2Client);
    // Mock config
    const configRestore = keypair.__set__("config", mockConfig);
    stubs.push({ restore: function () { return configRestore(); } });

    // Mock S3
    const s3Restore = keypair.__set__("s3", mockS3);
    stubs.push({ restore: function () { return s3Restore(); } });
  });

  afterEach(() => {
    // Reset mock
    keypairMock.reset();
    stubs.forEach(stub => stub.restore());
  });

  describe("create keypair", () => {

    // createKeyPair
    it("creates keypair", (done) => {
      const name = "my-keypair";

      // assert and resolve GetTableCommand
      keypairMock.on(CreateKeyPairCommand).callsFake(input => {
        // assert
        expect(input).to.eql({ KeyName: name });

        // resolve
        return {
          KeyName: name,
          KeyMaterial: "key-material"
        };
      });

      // Create key pair without saving to S3
      keypair.createKeyPair(name)
        .then(result => {
          expect(result).to.deep.equal({
            KeyName: name,
            KeyMaterial: "key-material"
          });
          done();
        })
        .catch(done);
    });

    // createKeyPair
    it("creates keypair and saves to S3", (done) => {
      const name = "my-keypair";
      const bucketName = "my-s3-bucket";
      const key = "bucket-key";

      // assert and resolve CreateKeyPairCommand
      keypairMock.on(CreateKeyPairCommand).callsFake(input => {
        // assert
        expect(input).to.eql({ KeyName: name });

        // resolve
        return {
          KeyName: name,
          KeyMaterial: "key-material"
        };
      });

      // Create key pair and save to S3
      keypair.createKeyPair(name, bucketName, key)
        .then(result => {
          expect(result).to.deep.equal({});
          done();
        })
        .catch(done);
    });
  });

  // deleteKeyPair
  describe("delete keypair", () => {

    it("deletes keypair", (done) => {
      const name = "my-keypair";

      // assert and resolve DeleteKeyPairCommand
      keypairMock.on(DeleteKeyPairCommand).callsFake(input => {
        // assert
        expect(input).to.eql({ KeyName: name });

        // resolve
        return {
          Return: true,
          KeyPairId: name,
        };
      });

      // Create key pair without saving to S3
      keypair.deleteKeyPair(name)
        .then(result => {
          expect(result).to.deep.equal({
            Return: true,
            KeyPairId: name,
          });
          done();
        })
        .catch(done);
    });

    it("deletes keypair and deletes from S3", (done) => {
      const name = "my-keypair";
      const bucketName = "my-s3-bucket";
      const key = "bucket-key";

      // assert and resolve DeleteKeyPairCommand
      keypairMock.on(DeleteKeyPairCommand).callsFake(input => {
        // assert
        expect(input).to.eql({ KeyName: name });

        // resolve
        return {
          Return: true,
          KeyPairId: name,
        };
      });

      // Create key pair without saving to S3
      keypair.deleteKeyPair(name, bucketName, key)
        .then(result => {
          expect(result).to.deep.equal({
            Deleted: [{
              DeleteMarker: true,
              DeleteMarkerVersionId: undefined,
              Key: key
            }]
          });
          done();
        })
        .catch(done);
    });
  });

});