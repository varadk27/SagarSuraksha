
import random
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
import json
import sys
import time
import cv2
from tensorflow.keras.models import load_model
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import os
import io
import logging

import sys
import os

if sys.platform.startswith('win'):
    import ctypes
    kernel32 = ctypes.windll.kernel32
    kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    os.system("chcp 65001")
    
import codecs

sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')


# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Suppress TensorFlow and Keras warnings
import tensorflow as tf
tf.get_logger().setLevel('ERROR')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import warnings
warnings.filterwarnings('ignore')

# Constants for image processing
IMG_HEIGHT = 256
IMG_WIDTH = 256
IMG_CLASSES = 5
IMG_CHANNELS = 3

# Color map for oil spill detection
COLOR_MAP = [
    [0, 0, 0],        # Black (Background)
    [0, 255, 255],    # Cyan (Sea)
    [238, 130, 238],  # Violet (Oil Spill)
    [255, 0, 0],      # Red (Ship)
    [0, 128, 0]       # Green (Land)
]

scaled_color_map = [[c[0] / 255.0, c[1] / 255.0, c[2] / 255.0] for c in COLOR_MAP]
cmap = mcolors.ListedColormap(scaled_color_map)

# At the beginning of your script, add or update this constant:
SINGLE_IMAGE_PATH = "images/img_0003.jpg"

logging.info(f"Current working directory: {os.getcwd()}")
logging.info(f"SINGLE_IMAGE_PATH: {SINGLE_IMAGE_PATH}")
logging.info(f"U-Net model path: {'unet_model.h5'}")

def detect_and_visualize_oil_spill(image_path, unet_model, save_path):
    try:
        logging.info(f"Processing image: {image_path}")
        
        # Read and preprocess the image
        image = cv2.imread(image_path, cv2.IMREAD_COLOR)
        if image is None:
            logging.error(f"Error: Unable to read image at {image_path}")
            return False
        logging.info("Image read successfully")
        
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)  # Convert BGR to RGB
        image_resized = cv2.resize(image, (IMG_HEIGHT, IMG_WIDTH))
        image_normalized = image_resized / 255.0
        logging.info("Image preprocessed")

        # Predict using U-Net model
        prediction_unet = unet_model.predict(np.expand_dims(image_normalized, axis=0))
        predicted_mask_unet = np.argmax(prediction_unet, axis=3)[0, :, :]
        logging.info("Prediction completed")

        # Print class distribution
        unique, counts = np.unique(predicted_mask_unet, return_counts=True)
        class_distribution = dict(zip(unique, counts))
        logging.info(f"Class distribution: {class_distribution}")

        # Check if oil spill is detected (class 2 in the color map)
        oil_spill_detected = np.any(predicted_mask_unet == 2)
        logging.info(f"Oil spill detected: {oil_spill_detected}")

        # Visualize and save the results
        logging.info(f"Saving visualization to: {save_path}")
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))
        ax1.imshow(image_resized)
        ax1.set_title("Original Image")
        ax1.axis('off')
        im = ax2.imshow(predicted_mask_unet, cmap=cmap, vmin=0, vmax=len(COLOR_MAP) - 1, interpolation='none')
        ax2.set_title("Predicted Mask")
        ax2.axis('off')
        cbar = fig.colorbar(im, ax=ax2, orientation='vertical', fraction=0.046, pad=0.04)
        cbar.set_ticks(range(len(COLOR_MAP)))
        cbar.set_ticklabels(['Background', 'Sea', 'Oil Spill', 'Ship', 'Land'])
        plt.tight_layout()
        
        # Save figure to a bytes buffer
        buf = io.BytesIO()
        plt.savefig(buf, format='png')
        buf.seek(0)
        
        # Write bytes to file
        with open(save_path, 'wb') as f:
            f.write(buf.getvalue())
        
        plt.close(fig)
        logging.info("Visualization saved successfully")

        return oil_spill_detected
    except Exception as e:
        logging.error(f"Error in detect_and_visualize_oil_spill: {str(e)}")
        return False

def process_data():
    try:
        # Load and preprocess the data
        logging.info("Loading and preprocessing data...")
        df = pd.read_csv('anomalous_dataset.csv')
        df['sudden_speed_change'] = abs(df['SOG'] - df['SOG'].shift(1))
        df = df.dropna()
        df['BaseDateTime'] = pd.to_datetime(df['BaseDateTime'])

        # Prepare features for anomaly detection
        X = df[['sudden_speed_change']]

        # Train the Isolation Forest model
        logging.info("Training Isolation Forest model...")
        iso_forest = IsolationForest(contamination=0.02, random_state=42)
        iso_forest.fit(X)

        # Load U-Net model
        logging.info("Loading U-Net model...")
        unet_model = load_model('unet_model.h5')
        logging.info("U-Net model loaded successfully")

        # Create a directory for saving oil spill images
        os.makedirs('oil_spill_images', exist_ok=True)

        # Process each row
        for index, row in df.iterrows():
            # Predict anomaly for this row
            row_features = pd.DataFrame({'sudden_speed_change': [row['sudden_speed_change']]})
            anomaly = iso_forest.predict(row_features)[0]

            # If anomaly is detected, check for oil spill
            oil_spill = False
            image_path = None
            if anomaly == -1:  # -1 indicates an anomaly in Isolation Forest
                logging.info(f"Anomaly detected at index {index}")
                if os.path.exists(SINGLE_IMAGE_PATH):
                    image_path = f"oil_spill_images/oil_spill_{index}.png"
                    oil_spill = detect_and_visualize_oil_spill(SINGLE_IMAGE_PATH, unet_model, image_path)
                else:
                    logging.warning(f"No image found at path: {SINGLE_IMAGE_PATH}")

            # Prepare row data
            row_data = {
                'BaseDateTime': row['BaseDateTime'].isoformat(),
                'SOG': float(row['SOG']),
                'COG': float(row['COG']),
                'LAT': float(row['LAT']),
                'LON': float(row['LON']),
                'Change': float(row['sudden_speed_change']),
                'anomaly': int(anomaly == -1),
                'oil_spill': int(oil_spill),
                'image_path': image_path if oil_spill else None
            }

            # Print the row data as JSON with a marker
            json_output = "JSON_START" + json.dumps(row_data) + "JSON_END"
            print(json_output)
            sys.stdout.flush()  # Ensure the output is immediately sent to Node.js

            # Sleep for 2 seconds
            time.sleep(2)
    except Exception as e:
        logging.error(f"Error in process_data: {str(e)}")

def main():
    while True:
        logging.info("Starting anomaly detection process...")
        try:
            process_data()
        except Exception as e:
            logging.error(f"An error occurred in main: {str(e)}")
        logging.info("Anomaly detection process completed. Restarting in 5 seconds...")
        time.sleep(5)

if __name__ == "__main__":
    main()


# import random
# import pandas as pd
# import numpy as np
# from sklearn.ensemble import IsolationForest
# import json
# import sys
# import time
# import cv2
# from tensorflow.keras.models import load_model
# import matplotlib.pyplot as plt
# import matplotlib.colors as mcolors
# import os
# import io

# # At the beginning of your script, add or update this constant:
# SINGLE_IMAGE_PATH = "python_scripts/images/img_0003.jpg"

# # Suppress TensorFlow and Keras warnings
# import tensorflow as tf
# tf.get_logger().setLevel('ERROR')
# os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
# import warnings
# warnings.filterwarnings('ignore')

# # Constants for image processing
# IMG_HEIGHT = 256
# IMG_WIDTH = 256
# IMG_CLASSES = 5
# IMG_CHANNELS = 3

# # Color map for oil spill detection
# COLOR_MAP = [
#     [0, 0, 0],        # Black (Background)
#     [0, 255, 255],    # Cyan (Sea)
#     [238, 130, 238],  # Violet (Oil Spill)
#     [255, 0, 0],      # Red (Ship)
#     [0, 128, 0]       # Green (Land)
# ]

# scaled_color_map = [[c[0] / 255.0, c[1] / 255.0, c[2] / 255.0] for c in COLOR_MAP]
# cmap = mcolors.ListedColormap(scaled_color_map)



# def detect_and_visualize_oil_spill(image_path, unet_model, save_path):
#     try:
#         print(f"Processing image: {image_path}")
        
#         # Read and preprocess the image
#         image = cv2.imread(image_path, cv2.IMREAD_COLOR)
#         if image is None:
#             print(f"Error: Unable to read image at {image_path}")
#             return False
#         print("Image read successfully")
        
#         image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)  # Convert BGR to RGB
#         image_resized = cv2.resize(image, (IMG_HEIGHT, IMG_WIDTH))
#         image_normalized = image_resized / 255.0
#         print("Image preprocessed")

#         # Predict using U-Net model
#         prediction_unet = unet_model.predict(np.expand_dims(image_normalized, axis=0))
#         predicted_mask_unet = np.argmax(prediction_unet, axis=3)[0, :, :]
#         print("Prediction completed")

#         # Print class distribution
#         unique, counts = np.unique(predicted_mask_unet, return_counts=True)
#         class_distribution = dict(zip(unique, counts))
#         print("Class distribution:", class_distribution)

#         # Check if oil spill is detected (class 2 in the color map)
#         oil_spill_detected = np.any(predicted_mask_unet == 2)
#         print(f"Oil spill detected: {oil_spill_detected}")

#         # Visualize and save the results
#         print(f"Saving visualization to: {save_path}")
#         fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))
#         ax1.imshow(image_resized)
#         ax1.set_title("Original Image")
#         ax1.axis('off')
#         im = ax2.imshow(predicted_mask_unet, cmap=cmap, vmin=0, vmax=len(COLOR_MAP) - 1, interpolation='none')
#         ax2.set_title("Predicted Mask")
#         ax2.axis('off')
#         cbar = fig.colorbar(im, ax=ax2, orientation='vertical', fraction=0.046, pad=0.04)
#         cbar.set_ticks(range(len(COLOR_MAP)))
#         cbar.set_ticklabels(['Background', 'Sea', 'Oil Spill', 'Ship', 'Land'])
#         plt.tight_layout()
        
#         # Save figure to a bytes buffer
#         buf = io.BytesIO()
#         plt.savefig(buf, format='png')
#         buf.seek(0)
        
#         # Write bytes to file
#         with open(save_path, 'wb') as f:
#             f.write(buf.getvalue())
        
#         plt.close(fig)
#         print("Visualization saved successfully")

#         return oil_spill_detected
#     except Exception as e:
#         print(f"Error in detect_and_visualize_oil_spill: {str(e)}")
#         return False

# def process_data():
#     try:
#         # Load and preprocess the data
#         df = pd.read_csv('anomalous_dataset.csv')
#         df['sudden_speed_change'] = abs(df['SOG'] - df['SOG'].shift(1))
#         df = df.dropna()
#         df['BaseDateTime'] = pd.to_datetime(df['BaseDateTime'])

#         # Prepare features for anomaly detection
#         X = df[['sudden_speed_change']]

#         # Train the Isolation Forest model
#         iso_forest = IsolationForest(contamination=0.02, random_state=42)
#         iso_forest.fit(X)

#         # Load U-Net model
#         unet_model = load_model('unet_model.h5')

#         # Create a directory for saving oil spill images
#         os.makedirs('oil_spill_images', exist_ok=True)

#         # Process each row
#         for index, row in df.iterrows():
#             # Predict anomaly for this row
#             row_features = pd.DataFrame({'sudden_speed_change': [row['sudden_speed_change']]})
#             anomaly = iso_forest.predict(row_features)[0]

#             # If anomaly is detected, check for oil spill
#             oil_spill = False
#             image_path = None
#             if anomaly == -1:  # -1 indicates an anomaly in Isolation Forest
#                 # Generate or retrieve image path based on location
#                 # input_image_path = f"images/location_{row['LAT']}_{row['LON']}.jpg"
#                 if os.path.exists(SINGLE_IMAGE_PATH ):
#                     image_path = f"oil_spill_images/oil_spill_{index}.png"
#                     oil_spill = detect_and_visualize_oil_spill(SINGLE_IMAGE_PATH , unet_model, image_path)
#                 else:
#                     print(f"Warning: No image found for location {SINGLE_IMAGE_PATH}")

#             # Prepare row data
#             row_data = {
#                 'BaseDateTime': row['BaseDateTime'].isoformat(),
#                 'SOG': float(row['SOG']),
#                 'COG': float(row['COG']),
#                 'LAT': float(row['LAT']),
#                 'LON': float(row['LON']),
#                 'Change': float(row['sudden_speed_change']),
#                 'anomaly': int(anomaly == -1),
#                 'oil_spill': int(oil_spill),
#                 'image_path': image_path if oil_spill else None
#             }

#             # Print the row data as JSON with a marker
#             print("JSON_START" + json.dumps(row_data) + "JSON_END")
#             sys.stdout.flush()  # Ensure the output is immediately sent to Node.js

#             # Sleep for 2 seconds
#             time.sleep(2)
#     except Exception as e:
#         print(f"Error in process_data: {str(e)}")

# def main():
#     while True:
#         print("Starting anomaly detection process...")
#         try:
#             process_data()
#         except Exception as e:
#             print(f"An error occurred in main: {str(e)}")
#         print("Anomaly detection process completed. Restarting in 5 seconds...")
#         time.sleep(5)

# if __name__ == "__main__":
#     main()
    
    
# def detect_and_visualize_oil_spill(image_path, unet_model, save_path):
#     try:
#         # Read and preprocess the image
#         image = cv2.imread(image_path, cv2.IMREAD_COLOR)
#         if image is None:
#             print(f"Error: Unable to read image at {image_path}")
#             return False
#         image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)  # Convert BGR to RGB
#         image_resized = cv2.resize(image, (IMG_HEIGHT, IMG_WIDTH))
#         image_normalized = image_resized / 255.0

#         # Predict using U-Net model
#         prediction_unet = unet_model.predict(np.expand_dims(image_normalized, axis=0))
#         predicted_mask_unet = np.argmax(prediction_unet, axis=3)[0, :, :]

#         # Print class distribution
#         unique, counts = np.unique(predicted_mask_unet, return_counts=True)
#         class_distribution = dict(zip(unique, counts))
#         print("Class distribution:", class_distribution)

#         # Check if oil spill is detected (class 2 in the color map)
#         oil_spill_detected = np.any(predicted_mask_unet == 2)
#         print(f"Oil spill detected: {oil_spill_detected}")

#         # Visualize and save the results
#         fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))
#         ax1.imshow(image_resized)
#         ax1.set_title("Original Image")
#         ax1.axis('off')
#         im = ax2.imshow(predicted_mask_unet, cmap=cmap, vmin=0, vmax=len(COLOR_MAP) - 1, interpolation='none')
#         ax2.set_title("Predicted Mask")
#         ax2.axis('off')
#         cbar = fig.colorbar(im, ax=ax2, orientation='vertical', fraction=0.046, pad=0.04)
#         cbar.set_ticks(range(len(COLOR_MAP)))
#         cbar.set_ticklabels(['Background', 'Sea', 'Oil Spill', 'Ship', 'Land'])
#         plt.tight_layout()
        
#         # Save figure to a bytes buffer
#         buf = io.BytesIO()
#         plt.savefig(buf, format='png')
#         buf.seek(0)
        
#         # Write bytes to file
#         with open(save_path, 'wb') as f:
#             f.write(buf.getvalue())
        
#         plt.close(fig)

#         return oil_spill_detected
#     except Exception as e:
#         print(f"Error in detect_and_visualize_oil_spill: {str(e)}")
#         return False    


    



# import random
# import pandas as pd
# import numpy as np
# from sklearn.ensemble import IsolationForest
# import json
# import sys
# import time
# import cv2
# from tensorflow.keras.models import load_model
# import matplotlib.pyplot as plt
# import matplotlib.colors as mcolors
# import os
# import io

# # Suppress TensorFlow and Keras warnings
# import tensorflow as tf
# tf.get_logger().setLevel('ERROR')
# os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
# import warnings
# warnings.filterwarnings('ignore')

# # Constants for image processing
# IMG_HEIGHT = 256
# IMG_WIDTH = 256
# IMG_CLASSES = 5
# IMG_CHANNELS = 3

# # Color map for oil spill detection
# COLOR_MAP = [
#     [0, 0, 0],        # Black (Background)
#     [0, 255, 255],    # Cyan (Sea)
#     [238, 130, 238],  # Violet (Oil Spill)
#     [255, 0, 0],      # Red (Ship)
#     [0, 128, 0]       # Green (Land)
# ]

# scaled_color_map = [[c[0] / 255.0, c[1] / 255.0, c[2] / 255.0] for c in COLOR_MAP]
# cmap = mcolors.ListedColormap(scaled_color_map)

# def detect_and_visualize_oil_spill(image_path, unet_model, save_path):
#     try:
#         # Read and preprocess the image
#         image = cv2.imread(image_path, cv2.IMREAD_COLOR)
#         if image is None:
#             print(f"Error: Unable to read image at {image_path}")
#             return False
#         image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)  # Convert BGR to RGB
#         image_resized = cv2.resize(image, (IMG_HEIGHT, IMG_WIDTH))
#         image_normalized = image_resized / 255.0

#         # Predict using U-Net model
#         prediction_unet = unet_model.predict(np.expand_dims(image_normalized, axis=0))
#         predicted_mask_unet = np.argmax(prediction_unet, axis=3)[0, :, :]

#         # Print class distribution
#         unique, counts = np.unique(predicted_mask_unet, return_counts=True)
#         class_distribution = dict(zip(unique, counts))
#         print("Class distribution:", class_distribution)

#         # Check if oil spill is detected (class 2 in the color map)
#         oil_spill_detected = np.any(predicted_mask_unet == 2)
#         print(f"Oil spill detected: {oil_spill_detected}")

#         # Visualize and save the results
#         fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))
#         ax1.imshow(image_resized)
#         ax1.set_title("Original Image")
#         ax1.axis('off')
#         im = ax2.imshow(predicted_mask_unet, cmap=cmap, vmin=0, vmax=len(COLOR_MAP) - 1, interpolation='none')
#         ax2.set_title("Predicted Mask")
#         ax2.axis('off')
#         cbar = fig.colorbar(im, ax=ax2, orientation='vertical', fraction=0.046, pad=0.04)
#         cbar.set_ticks(range(len(COLOR_MAP)))
#         cbar.set_ticklabels(['Background', 'Sea', 'Oil Spill', 'Ship', 'Land'])
#         plt.tight_layout()
        
#         # Save figure to a bytes buffer
#         buf = io.BytesIO()
#         plt.savefig(buf, format='png')
#         buf.seek(0)
        
#         # Write bytes to file
#         with open(save_path, 'wb') as f:
#             f.write(buf.getvalue())
        
#         plt.close(fig)

#         return oil_spill_detected
#     except Exception as e:
#         print(f"Error in detect_and_visualize_oil_spill: {str(e)}")
#         return False

# def process_data():
#     try:
#         # Load and preprocess the data
#         df = pd.read_csv('anomalous_dataset.csv')
#         df['sudden_speed_change'] = abs(df['SOG'] - df['SOG'].shift(1))
#         df = df.dropna()
#         df['BaseDateTime'] = pd.to_datetime(df['BaseDateTime'])

#         # Prepare features for anomaly detection
#         X = df[['sudden_speed_change']]

#         # Train the Isolation Forest model
#         iso_forest = IsolationForest(contamination=0.02, random_state=42)
#         iso_forest.fit(X)

#         # Load U-Net model
#         unet_model = load_model('unet_model.h5')

#         # Create a directory for saving oil spill images
#         os.makedirs('oil_spill_images', exist_ok=True)

#         # Specify the single image file to use
#         input_image_path = "images/img_0003.jpg"

#         # Check if the image file exists
#         if not os.path.exists(input_image_path):
#             print(f"Error: Image file '{input_image_path}' not found")
#             return

#         # Process each row
#         for index, row in df.iterrows():
#             # Predict anomaly for this row
#             row_features = pd.DataFrame({'sudden_speed_change': [row['sudden_speed_change']]})
#             anomaly = iso_forest.predict(row_features)[0]

#             # If anomaly is detected, check for oil spill
#             oil_spill = False
#             image_path = None
#             if anomaly == -1:  # -1 indicates an anomaly in Isolation Forest
#                 image_path = f"oil_spill_images/oil_spill_{index}.png"
#                 oil_spill = detect_and_visualize_oil_spill(input_image_path, unet_model, image_path)

#             # Prepare row data
#             row_data = {
#                 'BaseDateTime': row['BaseDateTime'].isoformat(),
#                 'SOG': float(row['SOG']),
#                 'COG': float(row['COG']),
#                 'LAT': float(row['LAT']),
#                 'LON': float(row['LON']),
#                 'Change': float(row['sudden_speed_change']),
#                 'anomaly': int(anomaly == -1),
#                 'oil_spill': int(oil_spill),
#                 'image_path': image_path if oil_spill else None
#             }

#             # Print the row data as JSON with a marker
#             print("JSON_START" + json.dumps(row_data) + "JSON_END")
#             sys.stdout.flush()  # Ensure the output is immediately sent to Node.js

#             # Sleep for 0.5 seconds
#             time.sleep(2)
#     except Exception as e:
#         print(f"Error in process_data: {str(e)}")

# def main():
#     while True:
#         print("Starting anomaly detection process...")
#         try:
#             process_data()
#         except Exception as e:
#             print(f"An error occurred in main: {str(e)}")
#         print("Anomaly detection process completed. Restarting in 5 seconds...")
#         time.sleep(5)

# if __name__ == "__main__":
#     main()


# import random
# import pandas as pd
# import numpy as np
# from sklearn.ensemble import IsolationForest
# import json
# import sys
# import time
# import cv2
# from tensorflow.keras.models import load_model
# import matplotlib.pyplot as plt
# import matplotlib.colors as mcolors
# import os
# import io

# # Suppress TensorFlow warnings
# import tensorflow as tf
# tf.get_logger().setLevel('ERROR')
# os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

# # Constants for image processing
# IMG_HEIGHT = 256
# IMG_WIDTH = 256
# IMG_CLASSES = 5
# IMG_CHANNELS = 3

# # Color map for oil spill detection
# COLOR_MAP = [
#     [0, 0, 0],
#     [0, 255, 255],
#     [255, 0, 0],
#     [153, 76, 0],
#     [0, 153, 0],
# ]

# scaled_color_map = [[c[0] / 255.0, c[1] / 255.0, c[2] / 255.0] for c in COLOR_MAP]
# cmap = mcolors.ListedColormap(scaled_color_map)

# def detect_and_visualize_oil_spill(image_path, unet_model, save_path):
#     try:
#         # Read and preprocess the image
#         image = cv2.imread(image_path, cv2.IMREAD_COLOR)
#         if image is None:
#             print(f"Error: Unable to read image at {image_path}")
#             return False
#         image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)  # Convert BGR to RGB
#         image_resized = cv2.resize(image, (IMG_HEIGHT, IMG_WIDTH))
#         image_normalized = image_resized / 255.0

#         # Predict using U-Net model
#         prediction_unet = unet_model.predict(np.expand_dims(image_normalized, axis=0))
#         predicted_mask_unet = np.argmax(prediction_unet, axis=3)[0, :, :]

#         # Check if oil spill is detected (class 2 in the color map)
#         oil_spill_detected = np.any(predicted_mask_unet == 2)

#         if oil_spill_detected:
#             # Visualize and save the results
#             fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))
#             ax1.imshow(image_resized)
#             ax1.set_title("Original Image")
#             ax1.axis('off')
#             im = ax2.imshow(predicted_mask_unet, cmap=cmap, vmin=0, vmax=len(COLOR_MAP) - 1, interpolation='none')
#             ax2.set_title("Predicted Mask")
#             ax2.axis('off')
#             cbar = fig.colorbar(im, ax=ax2, orientation='vertical', fraction=0.046, pad=0.04)
#             cbar.set_ticks(range(len(COLOR_MAP)))
#             cbar.set_ticklabels(['Background', 'Sea', 'Oil Spill', 'Ship', 'Land'])
#             plt.tight_layout()
            
#             # Save figure to a bytes buffer
#             buf = io.BytesIO()
#             plt.savefig(buf, format='png')
#             buf.seek(0)
            
#             # Write bytes to file
#             with open(save_path, 'wb') as f:
#                 f.write(buf.getvalue())
            
#             plt.close(fig)

#         return oil_spill_detected
#     except Exception as e:
#         print(f"Error in detect_and_visualize_oil_spill: {str(e)}")
#         return False

# def process_data():
#     try:
#         # Load and preprocess the data
#         df = pd.read_csv('anomalous_dataset.csv')
#         df['sudden_speed_change'] = abs(df['SOG'] - df['SOG'].shift(1))
#         df = df.dropna()
#         df['BaseDateTime'] = pd.to_datetime(df['BaseDateTime'])

#         # Prepare features for anomaly detection
#         X = df[['sudden_speed_change']]

#         # Train the Isolation Forest model
#         iso_forest = IsolationForest(contamination=0.02, random_state=42)
#         iso_forest.fit(X)

#         # Load U-Net model
#         unet_model = load_model('unet_model.h5')

#         # Create a directory for saving oil spill images
#         os.makedirs('oil_spill_images', exist_ok=True)

#         # Specify the single image file to use
#         input_image_path = "images/img_0001.jpg"

#         # Check if the image file exists
#         if not os.path.exists(input_image_path):
#             print(f"Error: Image file '{input_image_path}' not found")
#             return

#         # Process each row
#         for index, row in df.iterrows():
#             # Predict anomaly for this row
#             row_features = pd.DataFrame({'sudden_speed_change': [row['sudden_speed_change']]})
#             anomaly = iso_forest.predict(row_features)[0]

#             # If anomaly is detected, check for oil spill
#             oil_spill = False
#             image_path = None
#             if anomaly == -1:  # -1 indicates an anomaly in Isolation Forest
#                 image_path = f"oil_spill_images/oil_spill_{index}.png"
#                 oil_spill = detect_and_visualize_oil_spill(input_image_path, unet_model, image_path)

#             # Prepare row data
#             row_data = {
#                 'BaseDateTime': row['BaseDateTime'].isoformat(),
#                 'SOG': float(row['SOG']),
#                 'COG': float(row['COG']),
#                 'LAT': float(row['LAT']),
#                 'LON': float(row['LON']),
#                 'Change': float(row['sudden_speed_change']),
#                 'anomaly': int(anomaly == -1),
#                 'oil_spill': int(oil_spill),
#                 'image_path': image_path if oil_spill else None
#             }

#             # Print the row data as JSON with a marker
#             print("JSON_START" + json.dumps(row_data) + "JSON_END")
#             sys.stdout.flush()  # Ensure the output is immediately sent to Node.js

#             # Sleep for 0.5 seconds
#             time.sleep(2)
#     except Exception as e:
#         print(f"Error in process_data: {str(e)}")

# def main():
#     while True:
#         print("Starting anomaly detection process...")
#         try:
#             process_data()
#         except Exception as e:
#             print(f"An error occurred in main: {str(e)}")
#         print("Anomaly detection process completed. Restarting in 5 seconds...")
#         time.sleep(5)

# if __name__ == "__main__":
#     main()


#######  No error , but not getting oil spill
# import random
# import pandas as pd
# import numpy as np
# from sklearn.ensemble import IsolationForest
# import json
# import sys
# import time
# import cv2
# from tensorflow.keras.models import load_model
# import matplotlib.pyplot as plt
# import matplotlib.colors as mcolors
# import os
# import io

# # Suppress TensorFlow warnings
# import tensorflow as tf
# tf.get_logger().setLevel('ERROR')
# os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

# # Constants for image processing
# IMG_HEIGHT = 256
# IMG_WIDTH = 256
# IMG_CLASSES = 5
# IMG_CHANNELS = 3

# # Color map for oil spill detection
# COLOR_MAP = [
#     [0, 0, 0],
#     [0, 255, 255],
#     [255, 0, 0],
#     [153, 76, 0],
#     [0, 153, 0],
# ]

# scaled_color_map = [[c[0] / 255.0, c[1] / 255.0, c[2] / 255.0] for c in COLOR_MAP]
# cmap = mcolors.ListedColormap(scaled_color_map)

# def detect_and_visualize_oil_spill(image_path, unet_model, save_path):
#     try:
#         # Read and preprocess the image
#         image = cv2.imread(image_path, cv2.IMREAD_COLOR)
#         if image is None:
#             print(f"Error: Unable to read image at {image_path}")
#             return False
#         image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)  # Convert BGR to RGB
#         image_resized = cv2.resize(image, (IMG_HEIGHT, IMG_WIDTH))
#         image_normalized = image_resized / 255.0

#         # Predict using U-Net model
#         prediction_unet = unet_model.predict(np.expand_dims(image_normalized, axis=0))
#         predicted_mask_unet = np.argmax(prediction_unet, axis=3)[0, :, :]

#         # Check if oil spill is detected (class 2 in the color map)
#         oil_spill_detected = np.any(predicted_mask_unet == 2)

#         if oil_spill_detected:
#             # Visualize and save the results
#             fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))
#             ax1.imshow(image_resized)
#             ax1.set_title("Original Image")
#             ax1.axis('off')
#             im = ax2.imshow(predicted_mask_unet, cmap=cmap, vmin=0, vmax=len(COLOR_MAP) - 1, interpolation='none')
#             ax2.set_title("Predicted Mask")
#             ax2.axis('off')
#             cbar = fig.colorbar(im, ax=ax2, orientation='vertical', fraction=0.046, pad=0.04)
#             cbar.set_ticks(range(len(COLOR_MAP)))
#             cbar.set_ticklabels(['Background', 'Sea', 'Oil Spill', 'Ship', 'Land'])
#             plt.tight_layout()
            
#             # Save figure to a bytes buffer
#             buf = io.BytesIO()
#             plt.savefig(buf, format='png')
#             buf.seek(0)
            
#             # Write bytes to file
#             with open(save_path, 'wb') as f:
#                 f.write(buf.getvalue())
            
#             plt.close(fig)

#         return oil_spill_detected
#     except Exception as e:
#         print(f"Error in detect_and_visualize_oil_spill: {str(e)}")
#         return False

# def process_data():
#     try:
#         # Load and preprocess the data
#         df = pd.read_csv('anomalous_dataset.csv')
#         df['sudden_speed_change'] = abs(df['SOG'] - df['SOG'].shift(1))
#         df = df.dropna()
#         df['BaseDateTime'] = pd.to_datetime(df['BaseDateTime'])

#         # Prepare features for anomaly detection
#         X = df[['sudden_speed_change']]

#         # Train the Isolation Forest model
#         iso_forest = IsolationForest(contamination=0.02, random_state=42)
#         iso_forest.fit(X)

#         # Load U-Net model
#         unet_model = load_model('unet_model.h5')

#         # Create a directory for saving oil spill images
#         os.makedirs('oil_spill_images', exist_ok=True)

#         # Process each row
#         for index, row in df.iterrows():
#             # Predict anomaly for this row
#             row_features = pd.DataFrame({'sudden_speed_change': [row['sudden_speed_change']]})
#             anomaly = iso_forest.predict(row_features)[0]

#             # If anomaly is detected, check for oil spill
#             oil_spill = False
#             image_path = None
#             if anomaly == -1:  # -1 indicates an anomaly in Isolation Forest
#                 # Try to find an existing image file
#                 for i in range(1, 10):
#                     input_image_path = f"images/img_000{i}.jpg"
#                     if os.path.exists(input_image_path):
#                         image_path = f"oil_spill_images/oil_spill_{index}.png"
#                         oil_spill = detect_and_visualize_oil_spill(input_image_path, unet_model, image_path)
#                         break
#                 else:
#                     print("Error: No valid image files found in the 'images' directory")

#             # Prepare row data
#             row_data = {
#                 'BaseDateTime': row['BaseDateTime'].isoformat(),
#                 'SOG': float(row['SOG']),
#                 'COG': float(row['COG']),
#                 'LAT': float(row['LAT']),
#                 'LON': float(row['LON']),
#                 'Change': float(row['sudden_speed_change']),
#                 'anomaly': int(anomaly == -1),
#                 'oil_spill': int(oil_spill),
#                 'image_path': image_path if oil_spill else None
#             }

#             # Print the row data as JSON with a marker
#             print("JSON_START" + json.dumps(row_data) + "JSON_END")
#             sys.stdout.flush()  # Ensure the output is immediately sent to Node.js

#             # Sleep for 0.5 seconds
#             time.sleep(0.5)
#     except Exception as e:
#         print(f"Error in process_data: {str(e)}")

# def main():
#     while True:
#         print("Starting anomaly detection process...")
#         try:
#             process_data()
#         except Exception as e:
#             print(f"An error occurred in main: {str(e)}")
#         print("Anomaly detection process completed. Restarting in 5 seconds...")
#         time.sleep(5)

# if __name__ == "__main__":
#     main()


# import pandas as pd 
# import numpy as np 
# from sklearn.ensemble import IsolationForest 
# import json
# import sys
# import time

# def process_data():
#     # Load and preprocess the data
#     df = pd.read_csv('anomalous_dataset.csv')
#     df['sudden_speed_change'] = abs(df['SOG'] - df['SOG'].shift(1))
#     df = df.dropna()
#     df['BaseDateTime'] = pd.to_datetime(df['BaseDateTime'])

#     # Prepare features for anomaly detection
#     X = df[['sudden_speed_change']]

#     # Train the Isolation Forest model
#     iso_forest = IsolationForest(contamination=0.02, random_state=42)
#     iso_forest.fit(X)

#     # Process each row
#     for index, row in df.iterrows():
#         # Predict anomaly for this row
#         row_features = pd.DataFrame({'sudden_speed_change': [row['sudden_speed_change']]})
#         anomaly = iso_forest.predict(row_features)[0]

#         # Prepare row data
#         row_data = {
#             'BaseDateTime': row['BaseDateTime'].isoformat(),
#             'SOG': float(row['SOG']),
#             'COG': float(row['COG']),
#             'LAT': float(row['LAT']),
#             'LON': float(row['LON']),
#             'Change': float(row['sudden_speed_change']),
#             'anomaly': int(anomaly)
#         }

#         # Print the row data as JSON with a marker
#         print("JSON_START" + json.dumps(row_data) + "JSON_END")
#         sys.stdout.flush()  # Ensure the output is immediately sent to Node.js

#         # Sleep for 2 seconds
#         time.sleep(0.5)

# def main():
#     while True:
#         print("Starting anomaly detection process...")
#         process_data()
#         print("Anomaly detection process completed. Restarting in 5 seconds...")
#         time.sleep(5)

# if __name__ == "__main__":
#     main()