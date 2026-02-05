const _chai = require("chai");
const expect = _chai.expect;
const rewire = require("rewire");
const { mockClient } = require("aws-sdk-client-mock");
const { mockConfig, mockFs } = require("./stubs");
const {
  S3Client,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  PutObjectCommand,
  CreateMultipartUploadCommand, // Used for lib-storage/Upload
  UploadPartCommand, // Used for lib-storage/Upload
  PutBucketNotificationConfigurationCommand
} = require('@aws-sdk/client-s3');

// Rewire
const s3 = rewire("../src/s3");

// s3 Tests
describe("src/s3", () => {
  let stubs = [];

  // Mock s3 Client
  let s3Mock;

  beforeEach(() => {
    // Mock client
    s3Mock = mockClient(S3Client);
    // Mock config
    const configRestore = s3.__set__("config", mockConfig);
    stubs.push({ restore: function () { return configRestore(); } });

    // Mock 'fs'
    const fsRestore = s3.__set__("fs", mockFs.functions);
    stubs.push({ restore: function () { return fsRestore(); } });
  });

  afterEach(() => {
    // Reset mock
    s3Mock.reset();
    stubs.forEach(stub => stub.restore());
  });

  // putS3Object
  it("puts S3 object", (done) => {
    const params = {
      Bucket: "dest-bucket",
      Key: "dest-key",
      Body: "x".repeat(6 * 1024 * 1024)
    };

    // Mock these for the Upload command
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: '1' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '1' });

    // Add region for Upload
    const region = "test-region";
    process.env.AWS_REGION = region;

    // Put object
    s3.putS3Object(params)
      .then(() => done())
      .catch(done);
  });

  // listObjects
  it("lists objects", (done) => {
    const params = {
      Bucket: "bucketName",
      ContinuationToken: "continuationToken"
    };

    s3Mock.on(ListObjectsV2Command).callsFake(input => {
      expect(input).to.eql(params);
      return {
        IsTruncated: true,
        Contents: [
          {
            Key: "object_key",
          },
        ],
        ContinuationToken: params.ContinuationToken,
        NextContinuationToken: "NextContinuationToken",
      };
    });

    s3.listObjects(params.Bucket, params.ContinuationToken)
      .then(result => {
        expect(result).to.deep.equal({
          IsTruncated: true,
          Contents: [
            {
              Key: "object_key",
            },
          ],
          ContinuationToken: params.ContinuationToken,
          NextContinuationToken: "NextContinuationToken",
        });
        done();
      })
      .catch(done);
  });

  // listObjectVersions
  it("lists object versions", (done) => {
    const params = {
      Bucket: "bucketName",
      Prefix: "key",
      MaxKeys: 1,
      KeyMarker: "keyMarker",
      VersionIdMarker: "versionIdMarker"
    };
    const expected = {
      IsTruncated: true,
      KeyMarker: params.KeyMarker,
      VersionIdMarker: params.VersionIdMarker,
      NextKeyMarker: "NextKeyMarker",
      NextVersionIdMarker: "NextVersionIdMarker",
      Versions: [
        {
          Key: "object_key",
          VersionId: null,
          IsLatest: true
        },
        {
          Key: "object_key",
          VersionId: "object_version_id",
          IsLatest: false
        }
      ]
    };

    s3Mock.on(ListObjectVersionsCommand).callsFake(input => {
      expect(input).to.eql(params);
      return expected;
    });

    s3.listObjectVersions(params.Bucket, params.Prefix, params.KeyMarker, params.VersionIdMarker)
      .then(result => {
        expect(result).to.deep.equal(expected);
        done();
      })
      .catch(done);
  });

  // deleteObjects
  it("deletes objects", (done) => {
    const params = {
      Bucket: "bucketName",
      Delete: {
        Objects: [
          { Key: "key_1" },
          { Key: "key_2" }
        ]
      }
    };
    const expected = {
      Deleted: [
        {
          DeleteMarker: true,
          DeleteMarkerVersionId: "A._w1z6EFiCF5uhtQMDal9JDkID9tQ7F",
          Key: "key_1"
        },
        {
          DeleteMarker: true,
          DeleteMarkerVersionId: "iOd_ORxhkKe_e8G8_oSGxt2PjsCZKlkt",
          Key: "key_2"
        }
      ]
    };

    s3Mock.on(DeleteObjectsCommand).callsFake(input => {
      expect(input).to.eql(params);
      return expected;
    });

    s3.deleteObjects(params.Bucket, params.Delete.Objects)
      .then(result => {
        expect(result).to.deep.equal(expected);
        done();
      })
      .catch(done);
  });

  // deleteVersionedObjects
  it("deletes versioned objects", (done) => {
    const params = {
      Bucket: "bucketName",
      Delete: {
        Objects: [
          { Key: "key_1" },
          { Key: "key_2" }
        ]
      }
    };

    // List Versions Mock
    s3Mock.on(ListObjectVersionsCommand).callsFake(input => {
      if (input.Prefix === "key_1") {
        if (input.KeyMarker) {
          // Last page
          return {
            IsTruncated: false,
            Versions: [
              {
                Key: "key_1",
                VersionId: "object_version_id",
                IsLatest: false
              }
            ]
          };
        } else {
          // First page
          return {
            IsTruncated: true,
            NextKeyMarker: "NextKeyMarker",
            NextVersionIdMarker: "NextVersionIdMarker",
            Versions: [
              {
                Key: "key_1",
                VersionId: null,
                IsLatest: true
              }
            ]
          };
        }
      } else {
        return {
          IsTruncated: false,
          Versions: [
            {
              Key: "key_2",
              VersionId: null,
              IsLatest: true
            }
          ]
        };
      }
    });

    // Delete Objects Mock
    s3Mock.on(DeleteObjectsCommand).callsFake(input => {
      return {
        Deleted: input.Delete.Objects.map(key => {
          return {
            DeleteMarker: true,
            DeleteMarkerVersionId: key.VersionId,
            Key: key.Key
          }
        })
      };
    });


    s3.deleteVersionedObjects(params.Bucket, params.Delete.Objects)
      .then(() => done())
      .catch(done);
  });

  // emptyBucket
  it("empties bucket", (done) => {
    // Mock GetBucketVersioningCommand
    s3Mock.on(GetBucketVersioningCommand).callsFake(input => {
      expect(Object.keys(input)).to.have.members(["Bucket"]);
      return { Status: input.Bucket.includes("versioned") ? "Enabled" : "Suspended" };
    });

    // Mock ListObjectsV2Command
    s3Mock.on(ListObjectsV2Command).callsFake(input => {
      return {
        IsTruncated: true,
        Contents: [
          { Key: "object_key" },
        ]
      };
    });

    // Mock ListObjectVersionsCommand
    s3Mock.on(ListObjectVersionsCommand).callsFake(input => {
      return {
        IsTruncated: false,
        Versions: [
          {
            Key: input.Prefix,
            VersionId: null,
            IsLatest: true
          }
        ]
      };
    });

    // Mock DeleteObjectsCommand
    s3Mock.on(DeleteObjectsCommand).callsFake(input => {
      return {
        Deleted: input.Delete.Objects.map(key => {
          return {
            DeleteMarker: true,
            DeleteMarkerVersionId: key.VersionId,
            Key: key.Key
          }
        })
      };
    });

    // Empty versioned bucket
    s3.emptyBucket("versioned-bucket-name")
      .then(() => s3.emptyBucket("bucket-name"))
      .then(() => done())
      .catch(done);
  });

  // uploadDirectory
  describe("upload directory", () => {

    it("uploads directory of files", (done) => {
      const bucket = "bucket-name";
      const prefix = mockFs.ONLY_FILES_DIR;

      // Mock PutObjectCommand
      s3Mock.on(PutObjectCommand).callsFake(input => {
        expect(Object.keys(input)).to.have.members(["Bucket", "Key", "Body", "ContentType"]);
        expect(input.Bucket).to.eql(bucket);
        expect(input.Key.startsWith("file")).to.be.true;
        expect(input.Body).to.not.be.null;
        expect(input.ContentType).to.eql("application/octet-stream");
        return {};
      });

      s3.uploadDirectory(bucket, prefix)
        .then(() => done())
        .catch(done);
    });

    it("uploads directory of files and directory", (done) => {
      const bucket = "bucket-name";
      const prefix = mockFs.MIX_FILES_DIR;

      // Mock PutObjectCommand
      s3Mock.on(PutObjectCommand).callsFake(input => {
        expect(Object.keys(input)).to.have.members(["Bucket", "Key", "Body", "ContentType"]);
        expect(input.Bucket).to.eql(bucket);
        expect(input.Key.startsWith("file") || input.Key.startsWith("dir_1/")).to.be.true;
        expect(input.Body).to.not.be.null;
        expect(input.ContentType).to.eql("application/octet-stream");
        return {};
      });

      s3.uploadDirectory(bucket, prefix)
        .then(() => done())
        .catch(done);
    });

    it("fails - no files in directory", (done) => {
      const bucket = "bucket-name";
      const prefix = mockFs.NO_FILES_DIR;

      s3.uploadDirectory(bucket, prefix)
        .then(() => done(new Error('Expected rejection')))
        .catch(err => {
          expect(err.message).to.equal(`Folder '${prefix}' is empty or does not exist. Did you forget to build your application?`);
          done();
        })
        .catch(done);
    });
  });

  // uploadDirectoryAsZipFile
  it("uploads directory as zip file", (done) => {
    // bucketName, key, source, dest, name
    const bucket = "bucket-name";
    const key = "file.zip"
    const dir = mockFs.ONLY_FILES_DIR;

    // Mock these for the Upload command
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: '1' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '1' });

    s3.uploadDirectoryAsZipFile(bucket, key, dir, dir, key)
      .then(result => {
        expect(result).to.deep.equal(`${mockFs.ONLY_FILES_DIR}/${key}`);
        done();
      })
      .catch(done);
  });

  // putBucketNotificationConfiguration
  it("puts bucket notification configuration", (done) => {
    const params = {
      Bucket: "bucket",
      NotificationConfiguration: {
        EventBridgeConfiguration: {},
        LambdaFunctionConfigurations: [],
        QueueConfigurations: [],
        TopicConfigurations: []
      }
    };

    s3Mock.on(PutBucketNotificationConfigurationCommand).callsFake(input => {
      expect(input).to.eql(params);
      return {
        '$metadata': {
          httpStatusCode: 200,
          requestId: 'requestId',
          extendedRequestId: 'extendedRequestId',
          cfId: undefined,
          attempts: 1,
          totalRetryDelay: 0
        }
      };
    });

    s3.putBucketNotificationConfiguration(params)
      .then(result => {
        expect(result).to.deep.equal({
          '$metadata': {
            httpStatusCode: 200,
            requestId: 'requestId',
            extendedRequestId: 'extendedRequestId',
            cfId: undefined,
            attempts: 1,
            totalRetryDelay: 0
          }
        });
        done();
      })
      .catch(done);
  });

});