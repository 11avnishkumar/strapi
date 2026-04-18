import { pipeline } from 'stream';
import fs, { ReadStream } from 'fs';
import path from 'path';
import fse from 'fs-extra';
import * as utils from '@strapi/utils';

// Needed to load global.strapi without having to put @strapi/types in the regular dependencies
import type {} from '@strapi/types';

interface File {
  name: string;
  alternativeText?: string;
  caption?: string;
  width?: number;
  height?: number;
  formats?: Record<string, unknown>;
  hash: string;
  ext?: string;
  mime: string;
  size: number;
  sizeInBytes: number;
  url: string;
  previewUrl?: string;
  path?: string;
  provider?: string;
  provider_metadata?: Record<string, unknown>;
  stream?: ReadStream;
  buffer?: Buffer;
  destination?: string;
}

const { PayloadTooLargeError } = utils.errors;
const { kbytesToBytes, bytesToHumanReadable } = utils.file;

const UPLOADS_FOLDER_NAME = 'uploads';
/*
* TODO
*  fix the typescript error right now we have disabled it
*  error handling for secondary path, if the path does not exits
*  Idea: We can create a new path if the path does not exist, rather throwing error
*  Idea2: Can we give the configurations to the users so that they can put their desired folder inside the upload config and let the user decide what folder they can have rather hardcoding here
*
*
*
* */
const UPLOADS_FOLDER_SECONDARY = 'secondary';

interface InitOptions {
  sizeLimit?: number;
}

interface CheckFileSizeOptions {
  sizeLimit?: number;
}

export default {
  init({ sizeLimit: providerOptionsSizeLimit }: InitOptions = {}) {
    // TODO V5: remove providerOptions sizeLimit
    if (providerOptionsSizeLimit) {
      process.emitWarning(
        '[deprecated] In future versions, "sizeLimit" argument will be ignored from upload.config.providerOptions. Move it to upload.config'
      );
    }

    // Ensure uploads folder exists
    const uploadPath = path.resolve(strapi.dirs.static.public, UPLOADS_FOLDER_NAME);
    const secondaryUploadPath = path.resolve(strapi.dirs.static.public, UPLOADS_FOLDER_SECONDARY);
    if (!fse.pathExistsSync(uploadPath)) {
      throw new Error(
        `The upload folder (${uploadPath}) doesn't exist or is not accessible. Please make sure it exists.`
      );
    }

    /* Error handling for the secondary path if that not found */
    if (!fse.pathExistsSync(secondaryUploadPath)) {
      throw new Error(
        `Secondary upload folder (${secondaryUploadPath}) doesn't exist or is not accessible. Please make sure it exists.`
      );
    }

    return {
      checkFileSize(file: File, options: CheckFileSizeOptions) {
        const { sizeLimit } = options ?? {};

        // TODO V5: remove providerOptions sizeLimit
        if (providerOptionsSizeLimit) {
          if (kbytesToBytes(file.size) > providerOptionsSizeLimit)
            throw new PayloadTooLargeError(
              `${file.name} exceeds size limit of ${bytesToHumanReadable(
                providerOptionsSizeLimit
              )}.`
            );
        } else if (sizeLimit) {
          if (kbytesToBytes(file.size) > sizeLimit)
            throw new PayloadTooLargeError(
              `${file.name} exceeds size limit of ${bytesToHumanReadable(sizeLimit)}.`
            );
        }
      },
      uploadStream(file: File): Promise<void> {
        if (!file.stream) {
          return Promise.reject(new Error('Missing file stream'));
        }

        const { stream } = file;

        return new Promise((resolve, reject) => {
          pipeline(
            stream,
            fs.createWriteStream(path.join(file.destination === 'DEFAULT' ? uploadPath : secondaryUploadPath, `${file.hash}${file.ext}`)),
            (err) => {
              if (err) {
                return reject(err);
              }
              strapi.log.debug(file);

              // file.url = `/${UPLOADS_FOLDER_NAME}/${file.hash}${file.ext}`
              file.url = file.destination === 'DEFAULT'
                  ? `/${UPLOADS_FOLDER_NAME}/${file.hash}${file.ext}`
                  : `/${UPLOADS_FOLDER_SECONDARY}/${file.hash}${file.ext}`;

              resolve();
            }
          );
        });
      },
      upload(file: File): Promise<void> {
        console.log(file);
        if (!file.buffer) {
          return Promise.reject(new Error('Missing file buffer'));
        }
        strapi.log.debug(file);
        console.log('CUSTOM PROVIDER UPLOAD CALLED', file.name);

        const { buffer } = file;

        return new Promise((resolve, reject) => {
          // write file in public/assets folder
          fs.writeFile(path.join(file.destination === 'DEFAULT' ? uploadPath : secondaryUploadPath, `${file.hash}${file.ext}`), buffer, (err) => {
            if (err) {
              return reject(err);
            }

            // file.url = `/${UPLOADS_FOLDER_NAME}/${file.hash}${file.ext}`;
            file.url = file.destination === 'DEFAULT'
                ? `/${UPLOADS_FOLDER_NAME}/${file.hash}${file.ext}`
                : `/${UPLOADS_FOLDER_SECONDARY}/${file.hash}${file.ext}`;
            resolve();
          });
        });
      },
      delete(file: File): Promise<string | void> {
        return new Promise((resolve, reject) => {
          const filePath = path.join(file.destination === 'DEFAULT' ? uploadPath : secondaryUploadPath, `${file.hash}${file.ext}`);

          if (!fs.existsSync(filePath)) {
            resolve("File doesn't exist");
            return;
          }

          // remove file from public/assets folder
          fs.unlink(filePath, (err) => {
            if (err) {
              return reject(err);
            }

            resolve();
          });
        });
      },
    };
  },
};
