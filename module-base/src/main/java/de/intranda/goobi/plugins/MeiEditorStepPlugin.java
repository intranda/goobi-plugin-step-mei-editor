package de.intranda.goobi.plugins;

/**
 * This file is part of a plugin for Goobi - a Workflow tool for the support of mass digitization.
 *
 * Visit the websites for more information.
 *          - https://goobi.io
 *          - https://www.intranda.com
 *          - https://github.com/intranda/goobi
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program; if not, write to the Free Software Foundation, Inc., 59
 * Temple Place, Suite 330, Boston, MA 02111-1307 USA
 *
 */

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

import org.apache.commons.configuration.SubnodeConfiguration;
import org.goobi.beans.Process;
import org.goobi.beans.Step;
import org.goobi.production.enums.PluginGuiType;
import org.goobi.production.enums.PluginReturnValue;
import org.goobi.production.enums.PluginType;
import org.goobi.production.enums.StepReturnValue;
import org.goobi.production.plugin.interfaces.IStepPluginVersion2;

import de.sub.goobi.config.ConfigPlugins;
import de.sub.goobi.helper.NIOFileUtils;
import de.sub.goobi.helper.StorageProvider;
import de.sub.goobi.helper.exceptions.DAOException;
import de.sub.goobi.helper.exceptions.SwapException;
import de.sub.goobi.metadaten.Image;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.log4j.Log4j2;
import net.xeoh.plugins.base.annotations.PluginImplementation;

@PluginImplementation
@Log4j2
public class MeiEditorStepPlugin implements IStepPluginVersion2 {

    @Getter
    private String title = "intranda_step_mei_editor";
    @Getter
    private Step step;
    @Getter
    private String value;
    @Getter
    private boolean allowTaskFinishButtons;
    private String returnPath;

    // Image handling
    @Getter
    private List<Image> imageList = new ArrayList<>();
    @Getter
    @Setter
    private int currentImageIndex = 0;
    @Getter
    @Setter
    private String imageFolder = "media"; // or "media" for derivatives
    @Setter
    private Image currentImage;
    @Getter
    private int thumbnailSize = 200;

    // For direct page jump
    @Getter
    @Setter
    private String pageJumpInput = "1";

    // View mode: "image" or "thumbnail"
    @Getter
    @Setter
    private String viewMode = "image";

    /**
     * Toggle between image and thumbnail view
     */
    public void toggleViewMode() {
        if ("image".equals(viewMode)) {
            viewMode = "thumbnail";
        } else {
            viewMode = "image";
        }
    }

    /**
     * Check if in image view mode
     */
    public boolean isImageView() {
        return "image".equals(viewMode);
    }

    /**
     * Check if in thumbnail view mode
     */
    public boolean isThumbnailView() {
        return "thumbnail".equals(viewMode);
    }

    @Override
    public void initialize(Step step, String returnPath) {
        this.returnPath = returnPath;
        this.step = step;

        // read parameters from correct block in configuration file
        SubnodeConfiguration myconfig = ConfigPlugins.getProjectAndStepConfig(title, step);
        value = myconfig.getString("value", "default value");
        allowTaskFinishButtons = myconfig.getBoolean("allowTaskFinishButtons", false);
        imageFolder = myconfig.getString("imageFolder", "media");

        // Load images
        loadImages();
    }

    /**
     * Load all images from the process
     */
    private void loadImages() {
        imageList.clear();
        try {
            Process process = step.getProzess();
            String imageFolderPath;

            if ("master".equals(imageFolder)) {
                imageFolderPath = process.getImagesTifDirectory(true);
            } else if ("media".equals(imageFolder)) {
                // Use VariableReplacer to resolve the template string
                String mediaFolderTemplate = de.sub.goobi.config.ConfigurationHelper.getInstance().getProcessImagesMainDirectoryName();
                String mediaFolderName = de.sub.goobi.helper.VariableReplacer.simpleReplace(mediaFolderTemplate, process);
                imageFolderPath = process.getImagesDirectory() + "/" + mediaFolderName;
            } else {
                imageFolderPath = process.getImagesDirectory() + "/" + imageFolder;
            }

            Path imageDir = Paths.get(imageFolderPath);

            if (StorageProvider.getInstance().isFileExists(imageDir)) {
                // Use Goobi's filter for image files
                List<String> imageNameList = StorageProvider.getInstance().list(imageFolderPath, NIOFileUtils.imageOrObjectNameFilter);

                int order = 1;
                for (String imagename : imageNameList) {
                    try {
                        // Create Image object with Process, folder name, filename, order, and thumbnail size
                        String folderName = Paths.get(imageFolderPath).getFileName().toString();
                        Image image = new Image(process, imageFolderPath, imagename, order, thumbnailSize);
                        imageList.add(image);
                        order++;
                    } catch (IOException | SwapException | DAOException e) {
                        log.error("Error initializing image " + imagename, e);
                    }
                }

                // Set current image to first image if available
                if (!imageList.isEmpty()) {
                    currentImage = imageList.get(0);
                }
            } else {
                log.warn("Image directory does not exist: " + imageFolderPath);
            }
        } catch (IOException | SwapException e) {
            log.error("Error loading images from folder '" + imageFolder + "'", e);
        }
    }

    /**
     * Get the current Image object
     */
    public Image getCurrentImage() {
        if (currentImage != null) {
            return currentImage;
        }
        if (imageList != null && !imageList.isEmpty() && currentImageIndex >= 0 && currentImageIndex < imageList.size()) {
            currentImage = imageList.get(currentImageIndex);
            return currentImage;
        }
        return null;
    }

    /**
     * Navigate to next image
     */
    public void nextImage() {
        if (imageList != null && currentImageIndex < imageList.size() - 1) {
            currentImageIndex++;
            currentImage = imageList.get(currentImageIndex);
        }
    }

    /**
     * Navigate to previous image
     */
    public void previousImage() {
        if (currentImageIndex > 0) {
            currentImageIndex--;
            currentImage = imageList.get(currentImageIndex);
        }
    }

    /**
     * Select a specific image by index
     */
    public void selectImage(int index) {
        if (index >= 0 && index < imageList.size()) {
            currentImageIndex = index;
            currentImage = imageList.get(index);
        }
    }

    /**
     * Jump to first image
     */
    public void firstImage() {
        if (!imageList.isEmpty()) {
            currentImageIndex = 0;
            currentImage = imageList.get(0);
        }
    }

    /**
     * Jump to last image
     */
    public void lastImage() {
        if (!imageList.isEmpty()) {
            currentImageIndex = imageList.size() - 1;
            currentImage = imageList.get(currentImageIndex);
        }
    }

    /**
     * Jump to specific page number (1-based)
     */
    public void jumpToPage() {
        try {
            int pageNum = Integer.parseInt(pageJumpInput);
            // Convert 1-based to 0-based index
            int index = pageNum - 1;
            if (index >= 0 && index < imageList.size()) {
                currentImageIndex = index;
                currentImage = imageList.get(index);
            }
        } catch (NumberFormatException e) {
            log.warn("Invalid page number: " + pageJumpInput);
        }
    }

    /**
     * Get total number of images
     */
    public int getImageCount() {
        return imageList != null ? imageList.size() : 0;
    }

    /**
     * Get 1-based page number for display
     */
    public int getCurrentPageNumber() {
        return currentImageIndex + 1;
    }

    @Override
    public PluginGuiType getPluginGuiType() {
        return PluginGuiType.FULL;
    }

    @Override
    public String getPagePath() {
        return "/uii/plugin_step_mei_editor.xhtml";
    }

    @Override
    public PluginType getType() {
        return PluginType.Step;
    }

    @Override
    public String cancel() {
        return "/uii" + returnPath;
    }

    @Override
    public String finish() {
        return "/uii" + returnPath;
    }

    @Override
    public int getInterfaceVersion() {
        return 0;
    }

    @Override
    public HashMap<String, StepReturnValue> validate() {
        return null;
    }

    @Override
    public boolean execute() {
        PluginReturnValue ret = run();
        return ret != PluginReturnValue.ERROR;
    }

    @Override
    public PluginReturnValue run() {
        boolean successful = true;
        // your logic goes here

        if (!successful) {
            return PluginReturnValue.ERROR;
        }
        return PluginReturnValue.FINISH;
    }
}
