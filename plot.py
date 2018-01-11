import matplotlib.pyplot as plt
import time
import random
import pymongo
import pprint
from pymongo import MongoClient
import threading as thd
import time

uri = "mongodb://localhost:27017"
client = MongoClient(uri)

db = client['iotplatform']
# second_doc=db.coordinates.find().sort([('timestamp', -1)]).limit(2)
# print(list(second_doc)[0]['x'])
def update_data():
	now = int(round(time.time() * 1000))
	# latest_two_doc=db.coordinates.find().sort([('timestamp', -1)]).limit(2)
	# list_doc=list(latest_two_doc)
	latest_doc=db.coordinates.find_one({'timestamp':{'$gt':now-500}})
	print(now)
	print(latest_doc)
	# list_doc=list(latest_doc)
	# last_x = list_doc[0]['x']
	# last_y = list_doc[0]['y']
	last_x = latest_doc['x']
	last_y = latest_doc['y']
	# second_x = list_doc[1]['x']
	# second_y = list_doc[1]['y']
	# print(last_x)
	# print(list_doc[1]['x'])
	thd.Timer(0.1,update_data).start()
	return last_x,last_y

plt.show()
axes = plt.gca()
axes.set_xlim(0, +50)
axes.set_ylim(-10, +10)
line, = axes.plot([], [], 'ro')
# line.set_xdata(0,5,10,15,20,25,30,35,40)
# line.set_ydata(0,0,0,0,0,0,0,0,0)


while(1):
	last_x,last_y = update_data()

	print(last_x)

	# print(last_x)
	line.set_xdata(last_x)
	line.set_ydata(last_y)
	# line.plot(0,0)
	# line.set_xdata([0,5,10,15,20,25,30,35,40])
	# line.set_ydata([0,0,0,0,0,0,0,0,0])
	plt.axhspan(0.1, -0.1, facecolor='0.5', alpha=0.5)
	plt.plot([0,0.1],[0.1,0.1])
	plt.plot([5,5.1],[0.1,0.1])
	plt.plot([10,10.1],[0.1,0.1])
	plt.plot([15,15.1],[0.1,0.1])
	plt.plot([20,20.1],[0.1,0.1])
	plt.plot([25,25.1],[0.1,0.1])
	plt.plot([30,30.1],[0.1,0.1])
	plt.plot([35,35.1],[0.1,0.1])
	plt.plot([40,40.1],[0.1,0.1])
	# mask[7, 2] = True
	plt.pause(1e-5)
	time.sleep(0.01)
	plt.draw()

# plt.show()


# latest_x=[]
# collect = db['Student_log']
# collect = db.student_logs
# pprint.pprint(posts.find_one({"author": "Mike"}))
# post={"author": "Mike","text": "My first blog post!","tags": ["mongodb", "python", "pymongo"]}
# data=[]
# collect.insert_one(post).inserted_id
# print (db.student_logs.count()) # total number
# print ( db.student_logs.find_one() )
# print (list(second_doc)[1]['x'])
# latest_x=list(latest_doc)[0]['x']
# latest_y=list(latest_doc)[0]['y']
# print (list(second_doc))

# print (collect.find().limit(1))
# for each in collect.find():
# 	data.append(each)
# print (data)
# ysample = random.sample(range(-50, 50), 100)
# xsample = random.sample(range(-50, 50), 100)
# ysample = [-40,-20,0,40]
# xsample = [-40,-20,0,40]
#
# xdata = []
# ydata = []
#
# plt.show()
# #
# axes = plt.gca()
# axes.set_xlim(-50, +50)
# axes.set_ylim(-50, +50)
# line, = axes.plot(xdata, ydata, 'ro')
#
#
# for i in range(4):
# 	# xdata_t = xsample[i]
# 	# ydata_t = ysample[i]
#
# 	if i+1 <4:
# 		x_t = xsample[i]
# 		x_t1 = xsample[i+1]
# 		y_t = ysample[i]
# 		y_t1 = ysample[i+1]
# 		x_delta = float((x_t1 - x_t)/20)
# 		#print(x_delta)
# 		y_delta = float((y_t1 - y_t)/20)
# 		for j in range(20):
# 			xdata = x_t + x_delta*(j+1)
# 			ydata = y_t + y_delta*(j+1)
# 			#print(xdata)
# 			line.set_xdata(xdata)
# 			line.set_ydata(ydata)
#
# 			plt.pause(1e-20)
# 			time.sleep(0.1)
# 			plt.draw()
#
#
# # add this if you don't want the window to disappear at the end
# plt.show()
